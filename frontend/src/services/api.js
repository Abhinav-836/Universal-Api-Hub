// frontend/src/services/api.js
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE || '';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
  headers: { 
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  },
  withCredentials: true,  // ✅ Send cookies with requests
});

// ✅ Add token to headers if available (for /auth/me requests)
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  
  // ✅ Log request for debugging (remove in production)
  if (import.meta.env.DEV) {
    console.log(`[API Request] ${config.method.toUpperCase()} ${config.url}`, {
      hasToken: !!token,
      withCredentials: config.withCredentials
    });
  }
  
  return config;
});

// ✅ Enhanced response interceptor
api.interceptors.response.use(
  (response) => {
    // ✅ Log successful requests in dev
    if (import.meta.env.DEV) {
      console.log(`[API Response] ${response.config.method.toUpperCase()} ${response.config.url}`, {
        status: response.status,
        hasData: !!response.data
      });
    }
    return response;
  },
  async (error) => {
    const { config, response } = error;
    const originalRequest = config;
    
    // ✅ Handle 401 Unauthorized - but don't redirect if calling /auth/me
    if (response?.status === 401) {
      const path = window.location.pathname;
      const isAuthPage = ['/login', '/signup', '/'].includes(path);
      
      // ✅ Only clear token and redirect if not on auth pages
      if (!isAuthPage && !originalRequest._retry) {
        localStorage.removeItem('auth_token');
        // Add small delay to avoid flash
        setTimeout(() => {
          window.location.href = '/login';
        }, 100);
      }
    }
    
    // ✅ Handle 429 Rate Limiting with retry logic
    if (response?.status === 429 && !originalRequest._retry) {
      originalRequest._retry = true;
      const retryAfter = response.headers['retry-after'] || 2;
      console.warn(`Rate limited. Retrying in ${retryAfter}s...`);
      
      try {
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
        return api(originalRequest);
      } catch (retryError) {
        console.error('Retry failed:', retryError);
        return Promise.reject(retryError);
      }
    }
    
    // ✅ Handle network errors
    if (!response) {
      console.error('Network error - No response received');
      // Could show a toast notification here
    }
    
    return Promise.reject(error);
  }
);

export default api;