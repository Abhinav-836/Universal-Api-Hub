import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE || '';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

// Track request count for rate limiting
let requestCount = 0;
let lastResetTime = Date.now();

// Reset counter every 60 seconds
setInterval(() => {
  requestCount = 0;
  lastResetTime = Date.now();
}, 60000);

// Add request interceptor to track rate
api.interceptors.request.use((config) => {
  requestCount++;
  // console.log(`Request ${requestCount} to ${config.url}`);
  return config;
});

// Redirect to login on 401 (unless already on auth pages)
api.interceptors.response.use(
  (res) => res,
  (err) => {
    // Handle rate limiting gracefully
    if (err.response?.status === 429) {
      console.warn('Rate limited. Waiting 5 seconds...');
      // Don't redirect on 429, just reject
      return Promise.reject(err);
    }
    
    if (err.response?.status === 401) {
      const path = window.location.pathname;
      if (path !== '/login' && path !== '/signup' && path !== '/') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export default api;