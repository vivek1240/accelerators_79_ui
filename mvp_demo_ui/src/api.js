import axios from 'axios';

// Use Node backend: VITE_API_BASE in .env (e.g. http://localhost:4000) or /api in dev (Vite proxy -> Node)
const BASE = import.meta.env.VITE_API_BASE ?? (import.meta.env.DEV ? '/api' : 'https://agentic-router-production-aa61.up.railway.app');
if (import.meta.env.DEV) {
  console.log('[API] baseURL:', BASE);
}

const AUTH_STORAGE_KEY = 'agentic_router_auth';

const api = axios.create({
  baseURL: BASE,
  headers: { 'Content-Type': 'application/json' },
  // Allow long-running RAG queries on large documents (5 minutes by default).
  timeout: 300000,
});

let onUnauthorized = null;

/** Call when 401/503 auth so UI can clear user and show login */
export function setUnauthorizedHandler(cb) {
  onUnauthorized = cb;
}

/** Get stored auth from localStorage */
export function getStoredAuth() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Persist token and user to localStorage and set default header */
export function setAuthToken(token, user) {
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    if (user) {
      try {
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token, user }));
      } catch {}
    }
  }
}

/** Clear token and localStorage */
export function clearAuthToken() {
  delete api.defaults.headers.common['Authorization'];
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {}
}

// Attach Authorization header from storage on load
const stored = getStoredAuth();
if (stored?.token) {
  api.defaults.headers.common['Authorization'] = `Bearer ${stored.token}`;
}

// Don't set Content-Type for FormData - let browser set multipart/form-data with boundary
api.interceptors.request.use((config) => {
  if (config.data instanceof FormData && config.headers) {
    delete config.headers['Content-Type'];
  }
  return config;
});

// Log API errors and clear auth on 401/503 auth-related errors
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status;
    const detail = err.response?.data?.detail;
    const code = typeof detail === 'object' ? detail?.code : null;
    const authCodes = ['INVALID_TOKEN', 'USER_NOT_FOUND', 'UNAUTHORIZED', 'AUTH_NOT_AVAILABLE', 'AUTH_NOT_CONFIGURED'];
    if ((status === 401 || status === 503) && (code && authCodes.includes(code))) {
      clearAuthToken();
      if (typeof onUnauthorized === 'function') onUnauthorized();
    }
    const url = err.config?.baseURL + err.config?.url;
    const method = err.config?.method?.toUpperCase();
    const data = err.response?.data;
    const codeErr = err.code;
    console.error('[API Error]', {
      method,
      url,
      status,
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

export async function signup(body) {
  const { data } = await api.post('/auth/signup', body);
  return data;
}

export async function login(body) {
  const { data } = await api.post('/auth/login', body);
  return data;
}

/** Admin: list all users (requires role === 'admin') */
export async function listUsers() {
  const { data } = await api.get('/auth/users');
  return data;
}

/** Admin: set user access (requires role === 'admin') */
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
