// frontend/src/services/api.js
import axios from 'axios';

// In dev, Vite proxies /auth and /api to localhost:5000 (see vite.config.js).
// In production, VITE_API_BASE must be set in the Vercel project settings,
// e.g. https://universal-api-hub.onrender.com
const API_BASE = import.meta.env.VITE_API_BASE || '';

if (import.meta.env.PROD && !API_BASE) {
  // Without this, every call goes to the Vercel domain and gets index.html back.
  console.error('VITE_API_BASE is not set — API calls will fail in production.');
}

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  withCredentials: true,
});

const isPublicApiCall = (config) => (config?.url || '').includes('/api/v1/');

api.interceptors.request.use((config) => {
  // FIX: the dashboard JWT was attached to /api/v1 calls too, leaking the
  // session token to every playground request. Those calls authenticate
  // with X-API-Key only.
  if (!isPublicApiCall(config)) {
    const token = localStorage.getItem('auth_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

const MAX_AUTO_RETRY_SECONDS = 5;

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error;

    if (response?.status === 401 && config && !isPublicApiCall(config)) {
      const path = window.location.pathname;
      const isAuthPage = ['/login', '/signup', '/'].includes(path);
      if (!isAuthPage) {
        localStorage.removeItem('auth_token');
        setTimeout(() => { window.location.href = '/login'; }, 100);
      }
    }

    // FIX: every 429 used to be retried after 2s — including "daily limit
    // exceeded", which can't succeed until midnight. Only retry when the
    // server sends a short Retry-After.
    if (response?.status === 429 && config && !config._retry) {
      const retryAfter = parseInt(response.headers?.['retry-after'], 10);
      if (Number.isFinite(retryAfter) && retryAfter > 0 && retryAfter <= MAX_AUTO_RETRY_SECONDS) {
        config._retry = true;
        await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
        return api(config);
      }
    }

    return Promise.reject(error);
  }
);

export default api;