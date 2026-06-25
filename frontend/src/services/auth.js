import api from './api';

// Simple delay function
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const authService = {
  register: async (data) => {
    await delay(300);
    const response = await api.post('/auth/register', data);
    // Store token in localStorage as fallback
    if (response.data.token) {
      localStorage.setItem('auth_token', response.data.token);
    }
    return response.data;
  },
  
  login: async (data) => {
    await delay(300);
    const response = await api.post('/auth/login', data);
    // Store token in localStorage as fallback
    if (response.data.token) {
      localStorage.setItem('auth_token', response.data.token);
    }
    return response.data;
  },
  
  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch (_) {}
    localStorage.removeItem('auth_token');
  },
  
  me: async () => {
    await delay(200);
    try {
      const response = await api.get('/auth/me');
      return response.data;
    } catch (error) {
      // If 401, clear stored token
      if (error.response?.status === 401) {
        localStorage.removeItem('auth_token');
      }
      throw error;
    }
  },
};

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