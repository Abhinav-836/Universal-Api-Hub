// frontend/src/services/auth.js
import api from './api';

// Simple delay function for development (remove in production)
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const authService = {
  register: async (data) => {
    if (import.meta.env.DEV) await delay(300);
    
    const response = await api.post('/auth/register', data);
    
    if (response.data.token) {
      localStorage.setItem('auth_token', response.data.token);
    }
    
    return response.data;
  },
  
  login: async (data) => {
    if (import.meta.env.DEV) await delay(300);
    
    const response = await api.post('/auth/login', data);
    
    if (response.data.token) {
      localStorage.setItem('auth_token', response.data.token);
      console.log('✅ Token stored in localStorage');
    } else {
      console.warn('⚠️ No token returned from login response');
    }
    
    return response.data;
  },
  
  logout: async () => {
    try {
      await api.post('/auth/logout');
      console.log('✅ Server logout successful');
    } catch (error) {
      console.warn('⚠️ Server logout failed:', error.message);
    } finally {
      localStorage.removeItem('auth_token');
      console.log('✅ Local storage cleared');
    }
  },
  
  me: async () => {
    if (import.meta.env.DEV) await delay(200);
    
    try {
      const response = await api.get('/auth/me');
      
      if (response.data.success) {
        return response.data;
      }
      
      throw new Error(response.data.error || 'Failed to get user data');
      
    } catch (error) {
      if (error.response?.status === 401) {
        localStorage.removeItem('auth_token');
        console.log('🔄 Token removed due to 401 response');
      }
      
      throw error;
    }
  },
  
  isAuthenticated: () => {
    const token = localStorage.getItem('auth_token');
    return !!token;
  },
  
  getToken: () => {
    return localStorage.getItem('auth_token');
  }
};

// ✅ NEW: Plan Service with proper token handling
export const planService = {
  // Get all plans with features
  getPlans: async () => {
    const response = await api.get('/api/user/plans');
    return response.data;
  },

  // Get plan features
  getPlanFeatures: async () => {
    const response = await api.get('/api/user/plan-features');
    return response.data;
  },

  // Select/upgrade plan (Direct - No Payment)
  selectPlan: async (plan) => {
    const response = await api.post('/api/user/select-plan', { plan });
    
    // ✅ CRITICAL: Store the new token
    if (response.data.token) {
      localStorage.setItem('auth_token', response.data.token);
      console.log('✅ New token stored with updated plan:', plan);
    } else {
      console.warn('⚠️ No token returned from plan selection');
    }
    
    return response.data;
  },

  // Get current user's plan
  getCurrentPlan: async () => {
    const response = await api.get('/api/user/current-plan');
    return response.data;
  },

  // Create Stripe checkout session (for later)
  createCheckoutSession: async (plan) => {
    try {
      const response = await api.post('/api/user/checkout', { plan });
      return response.data;
    } catch (err) {
      console.warn('Stripe not configured, falling back to direct selection');
      return planService.selectPlan(plan);
    }
  }
};

// ✅ Dashboard service - selectPlan and createCheckoutSession removed
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
  }
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