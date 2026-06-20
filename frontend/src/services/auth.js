import api from './api';

// Simple delay function
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const authService = {
  register: async (data) => {
    await delay(300); // Small delay to prevent rate limiting
    return (await api.post('/auth/register', data)).data;
  },
  
  login: async (data) => {
    await delay(300);
    return (await api.post('/auth/login', data)).data;
  },
  
  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch (_) {}
  },
  
  me: async () => {
    // Add small delay to prevent rate limiting on repeated calls
    await delay(200);
    return (await api.get('/auth/me')).data;
  },
};

export const dashboardService = {
  getDashboard: async () => (await api.get('/api/user/dashboard')).data,
  getUsage: async () => (await api.get('/api/user/usage')).data,
  getApis: async () => (await api.get('/api/user/apis')).data,
  selectApi: async (apiId) => (await api.post('/api/user/apis/select', { apiId })).data,
  deselectApi: async (apiId) => (await api.delete(`/api/user/apis/${apiId}`)).data,
  selectPlan: async (plan) => (await api.post('/api/user/select-plan', { plan })).data,
  createCheckoutSession: async (plan) => {
    try {
      return (await api.post('/api/user/checkout', { plan })).data;
    } catch (err) {
      return await api.post('/api/user/select-plan', { plan });
    }
  },
};

export const apiKeyService = {
  list: async () => (await api.get('/api/user/keys')).data,
  create: async (data) => (await api.post('/api/user/keys', data)).data,
  revoke: async (keyId) => (await api.delete(`/api/user/keys/${keyId}`)).data,
  updateScopes: async (keyId, scopedApis) => (await api.patch(`/api/user/keys/${keyId}/scopes`, { scopedApis })).data,
};