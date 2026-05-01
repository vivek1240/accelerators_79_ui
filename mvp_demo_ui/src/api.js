import axios from 'axios';

// Use Node backend: VITE_API_BASE in .env (e.g. http://localhost:4000) or /api in dev (Vite proxy -> Node)
const BASE = import.meta.env.VITE_API_BASE ?? (import.meta.env.DEV ? '/api' : 'https://agentic-router-production-aa61.up.railway.app');
if (import.meta.env.DEV) {
  console.log('[API] baseURL:', BASE);
}

const api = axios.create({
  baseURL: BASE,
  headers: { 'Content-Type': 'application/json' },
  // Allow long-running RAG queries on large documents (5 minutes by default).
  timeout: 300000,
});

/** New id each full page load (FastAPI requires non-empty user_id for /upload and MAG). */
function randomObjectIdHex() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export const sessionUserId = randomObjectIdHex();

// Don't set Content-Type for FormData - let browser set multipart/form-data with boundary
api.interceptors.request.use((config) => {
  if (config.data instanceof FormData && config.headers) {
    delete config.headers['Content-Type'];
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const url = err.config?.baseURL + err.config?.url;
    const method = err.config?.method?.toUpperCase();
    const data = err.response?.data;
    const codeErr = err.code;
    console.error('[API Error]', {
      method,
      url,
      status: err.response?.status,
      code: codeErr,
      message: err.message,
      responseData: data,
      isTimeout: codeErr === 'ECONNABORTED',
    });
    return Promise.reject(err);
  }
);

export async function health() {
  const { data } = await api.get('/health');
  return data;
}

/** Admin: list users (backend has no auth gate) */
export async function listUsers() {
  const { data } = await api.get('/auth/users');
  return data;
}

/** Admin: set user access */
export async function setUserAccess(userId, isAllowed) {
  const { data } = await api.patch(`/auth/users/${userId}/access`, { is_allowed: isAllowed });
  return data;
}

export async function route(query, pdfUploaded = false) {
  const { data } = await api.post('/route', { query, pdf_uploaded: pdfUploaded });
  return data;
}

export async function upload(file) {
  const form = new FormData();
  form.append('file', file);
  form.append('user_id', sessionUserId);
  const { data } = await api.post('/upload', form, { timeout: 180000 });
  return data;
}

export async function status(fileId) {
  const { data } = await api.get(`/status/${fileId}`);
  return data;
}

export async function getPages(fileId) {
  const { data } = await api.get(`/pages/${fileId}`);
  return data;
}

export async function getPagePreview(fileId, pageIndex) {
  const { data } = await api.get(`/pages/${fileId}/${pageIndex}/preview`, { responseType: 'blob' });
  return data;
}

/** Preview by 1-based PDF page number (use when list index != PDF page) */
export async function getPagePreviewByNumber(fileId, pageNumber) {
  const { data } = await api.get(`/pages/${fileId}/preview-by-page/${pageNumber}`, { responseType: 'blob' });
  return data;
}

export async function extract(fileId, pageIndices) {
  const { data } = await api.post('/extract', { file_id: fileId, page_indices: pageIndices });
  return data;
}

function _parseFastApiErrorText(text, status) {
  let code;
  let message = text || `HTTP ${status}`;
  try {
    const j = JSON.parse(text);
    const d = j.detail;
    if (typeof d === 'object' && d != null) {
      code = d.code;
      message = d.message || message;
    } else if (typeof d === 'string') {
      message = d;
    }
  } catch {
    /* keep defaults */
  }
  return { code, message };
}

export async function edgar(ticker, numYears = 3) {
  const { data } = await api.get(`/edgar/${ticker}`, { params: { num_years: numYears } });
  return data;
}

// ── MAG (Memory-Augmented Generation) ──

export async function magMemories(userId = sessionUserId) {
  const { data } = await api.get('/mag/memories', { params: userId ? { user_id: userId } : {} });
  return data;
}

/**
 * Stream a MAG query via SSE.  Returns an AbortController so the caller can cancel.
 *
 * @param {Object}   opts
 * @param {string}   opts.question
 * @param {string}   [opts.memoryId]
 * @param {string}   [opts.sessionId]
 * @param {function} opts.onMeta    - ({route, model, confidence}) => void
 * @param {function} opts.onChunk   - (textDelta: string) => void
 * @param {function} opts.onDone    - ({latency_ms}) => void
 * @param {function} opts.onError   - (message: string) => void
 * @returns {{ abort: () => void }}
 */
export function magQueryStream({
  question,
  memoryId,
  memoryIds,
  sessionId,
  deepThinking = true,
  onMeta,
  onChunk,
  onDone,
  onError,
}) {
  const controller = new AbortController();
  const url = `${BASE}/mag/query/stream`;

  (async () => {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          memory_id: memoryId || null,
          memory_ids: memoryIds?.length ? memoryIds : null,
          user_id: sessionUserId,
          session_id: sessionId || 'default',
          deep_thinking: deepThinking,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text();
        const { code, message } = _parseFastApiErrorText(text, res.status);
        onError?.(message, { code, status: res.status });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          try {
            const evt = JSON.parse(trimmed.slice(6));
            if (evt.type === 'meta')  onMeta?.(evt);
            if (evt.type === 'chunk') onChunk?.(evt.text);
            if (evt.type === 'done')  onDone?.(evt);
            if (evt.type === 'error') onError?.(evt.message, {});
          } catch { /* skip malformed lines */ }
        }
      }

      if (!buffer.includes('"done"')) {
        onDone?.({ latency_ms: 0 });
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        onError?.(err.message || 'Stream failed', {});
      }
    }
  })();

  return { abort: () => controller.abort() };
}

/** Extract error message from axios error (FastAPI returns detail as object or string) */
export function getErrorMessage(e, fallback = 'Request failed') {
  const detail = e?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  return detail?.message || e?.message || fallback;
}

export { BASE };
