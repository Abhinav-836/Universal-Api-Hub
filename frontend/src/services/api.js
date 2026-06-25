import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE || '';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
  headers: { 
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  },
  withCredentials: true,
});

// Add token to headers if available (fallback for cookie)
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    // Handle 401 Unauthorized
    if (err.response?.status === 401) {
      const path = window.location.pathname;
      if (!['/login', '/signup', '/'].includes(path)) {
        localStorage.removeItem('auth_token');
        // Only redirect if not already on auth pages
        window.location.href = '/login';
      }
    }
    
    // Handle 429 Rate Limiting
    if (err.response?.status === 429) {
      console.warn('Rate limited. Waiting before retry...');
      // Could show a toast notification here
    }
    
    return Promise.reject(err);
  }
);

export default api;