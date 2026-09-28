// frontend/src/services/api.js
import axios from 'axios';

// In dev, Vite proxies /auth and /api to localhost:5000 (see vite.config.js).
// In production, VITE_API_BASE must be set to your Render backend URL,
// e.g. https://universal-api-hub.onrender.com
const API_BASE = import.meta.env.VITE_API_BASE || '';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  if (import.meta.env.DEV) {
    console.log(`[API Request] ${config.method.toUpperCase()} ${config.url}`, {
      hasToken: !!token,
      withCredentials: config.withCredentials,
      baseURL: config.baseURL,
    });
  }

  return config;
});

api.interceptors.response.use(
  (response) => {
    if (import.meta.env.DEV) {
      console.log(`[API Response] ${response.config.method.toUpperCase()} ${response.config.url}`, {
        status: response.status,
      });
    }
    return response;
  },
  async (error) => {
    const { config, response } = error;
    const originalRequest = config;

    if (response?.status === 401) {
      const path = window.location.pathname;
      const isAuthPage = ['/login', '/signup', '/'].includes(path);

      const reqUrl = originalRequest?.url || '';
      const usedApiKey = !!(
        originalRequest?.headers?.['X-API-Key'] ||
        originalRequest?.headers?.get?.('x-api-key')
      );
      const isApiKeyCall = usedApiKey || reqUrl.includes('/api/v1/');

      if (!isAuthPage && !isApiKeyCall && !originalRequest._retry) {
        localStorage.removeItem('auth_token');
        setTimeout(() => {
          window.location.href = '/login';
        }, 100);
      }
    }

    if (response?.status === 429 && !originalRequest._retry) {
      originalRequest._retry = true;
      const retryAfter = response.headers['retry-after'] || 2;
      console.warn(`Rate limited. Retrying in ${retryAfter}s...`);
      try {
        await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
        return api(originalRequest);
      } catch (retryError) {
        console.error('Retry failed:', retryError);
        return Promise.reject(retryError);
      }
    }

    if (!response) {
      console.error('Network error - no response received');
    }

    return Promise.reject(error);
  }
);

export default api;