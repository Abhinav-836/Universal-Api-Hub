// frontend/src/services/auth.js
import api from './api';

// Simple delay function for development (remove in production)
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const authService = {
  register: async (data) => {
    // ✅ Only delay in development
    if (import.meta.env.DEV) await delay(300);
    
    const response = await api.post('/auth/register', data);
    
    // ✅ Store token in localStorage if provided (for future requests)
    if (response.data.token) {
      localStorage.setItem('auth_token', response.data.token);
    }
    
    return response.data;
  },
  
  login: async (data) => {
    // ✅ Only delay in development
    if (import.meta.env.DEV) await delay(300);
    
    const response = await api.post('/auth/login', data);
    
    // ✅ Store token in localStorage for Authorization header
    if (response.data.token) {
      localStorage.setItem('auth_token', response.data.token);
      console.log('✅ Token stored in localStorage');
    } else {
      console.warn('⚠️ No token returned from login response');
    }
    
    // ✅ Return full response including user data
    return response.data;
  },
  
  logout: async () => {
    try {
      // ✅ Attempt to logout on server (clears cookie)
      await api.post('/auth/logout');
      console.log('✅ Server logout successful');
    } catch (error) {
      // ✅ Log error but don't fail - we still clear local storage
      console.warn('⚠️ Server logout failed:', error.message);
    } finally {
      // ✅ Always clear local storage
      localStorage.removeItem('auth_token');
      console.log('✅ Local storage cleared');
    }
  },
  
  me: async () => {
    // ✅ Only delay in development
    if (import.meta.env.DEV) await delay(200);
    
    try {
      const response = await api.get('/auth/me');
      
      // ✅ Token is still valid, return user data
      if (response.data.success) {
        return response.data;
      }
      
      // ✅ If response indicates failure, throw error
      throw new Error(response.data.error || 'Failed to get user data');
      
    } catch (error) {
      // ✅ If 401, clear stored token (it's invalid/expired)
      if (error.response?.status === 401) {
        localStorage.removeItem('auth_token');
        console.log('🔄 Token removed due to 401 response');
      }
      
      // ✅ Re-throw for the AuthProvider to handle
      throw error;
    }
  },
  
  // ✅ Helper to check if user is authenticated
  isAuthenticated: () => {
    const token = localStorage.getItem('auth_token');
    return !!token;  // Returns true if token exists
  },
  
  // ✅ Helper to get current token (for debugging)
  getToken: () => {
    return localStorage.getItem('auth_token');
  }
};

// ✅ Dashboard service functions (unchanged but kept for completeness)
export const dashboardService = {
  getDashboard: async () => {
    const response = await api.get('/api/user/dashboard');
    return response.data;
  },
  getUsage: async () => {
    const response = await api.get('/api/user/usage');
    return response.data;
  },
  getApis: async () => {
    const response = await api.get('/api/user/apis');
    return response.data;
  },
  selectApi: async (apiId) => {
    const response = await api.post('/api/user/apis/select', { apiId });
    return response.data;
  },
  deselectApi: async (apiId) => {
    const response = await api.delete(`/api/user/apis/${apiId}`);
    return response.data;
  },
  selectPlan: async (plan) => {
    const response = await api.post('/api/user/select-plan', { plan });
    return response.data;
  },
  createCheckoutSession: async (plan) => {
    try {
      const response = await api.post('/api/user/checkout', { plan });
      return response.data;
    } catch (err) {
      // ✅ Fallback to select-plan if checkout fails
      const response = await api.post('/api/user/select-plan', { plan });
      return response.data;
    }
  },
};

export const apiKeyService = {
  list: async () => {
    const response = await api.get('/api/user/keys');
    return response.data;
  },
  create: async (data) => {
    const response = await api.post('/api/user/keys', data);
    return response.data;
  },
  revoke: async (keyId) => {
    const response = await api.delete(`/api/user/keys/${keyId}`);
    return response.data;
  },
  updateScopes: async (keyId, scopedApis) => {
    const response = await api.patch(`/api/user/keys/${keyId}/scopes`, { scopedApis });
    return response.data;
  },
};