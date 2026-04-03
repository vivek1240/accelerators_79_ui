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

export async function query(fileId, question) {
  const { data } = await api.post('/query', {
    file_id: fileId,
    question,
    auto_detect_filters: true,
  });
  return data;
}

export async function edgar(ticker, numYears = 3) {
  const { data } = await api.get(`/edgar/${ticker}`, { params: { num_years: numYears } });
  return data;
}

/** Extract error message from axios error (FastAPI returns detail as object or string) */
export function getErrorMessage(e, fallback = 'Request failed') {
  const detail = e?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  return detail?.message || e?.message || fallback;
}

export { BASE };
