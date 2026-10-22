// frontend/src/services/auth.js
import api from './api';

export const authService = {
  register: async (data) => {
    const response = await api.post('/auth/register', data);
    if (response.data.token) {
      localStorage.setItem('auth_token', response.data.token);
    }
    return response.data;
  },

  login: async (data) => {
    const response = await api.post('/auth/login', data);
    if (response.data.token) {
      localStorage.setItem('auth_token', response.data.token);
    }
    return response.data;
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch (error) {
      // Server logout failing must not block a local logout
    } finally {
      localStorage.removeItem('auth_token');
    }
  },

  me: async () => {
    try {
      const response = await api.get('/auth/me');
      if (response.data.success) return response.data;
      throw new Error(response.data.error || 'Failed to get user data');
    } catch (error) {
      if (error.response?.status === 401) {
        localStorage.removeItem('auth_token');
      }
      throw error;
    }
  },

  isAuthenticated: () => !!localStorage.getItem('auth_token'),
  getToken: () => localStorage.getItem('auth_token'),
};

export const planService = {
  getPlans: async () => {
    const response = await api.get('/api/user/plans');
    return response.data;
  },

  getPlanFeatures: async () => {
    const response = await api.get('/api/user/plan-features');
    return response.data;
  },

  /**
   * Change plan. While the backend has free beta upgrades enabled this
   * switches immediately. Once BETA_FREE_UPGRADES=false, the backend answers
   * 402 { checkoutRequired } for upgrades — we then send the user to Stripe
   * checkout and resolve with { redirecting: true }.
   */
  selectPlan: async (plan) => {
    try {
      const response = await api.post('/api/user/select-plan', { plan });
      if (response.data.token) {
        localStorage.setItem('auth_token', response.data.token);
      }
      return response.data;
    } catch (err) {
      if (err.response?.status === 402 && err.response?.data?.checkoutRequired) {
        return planService.createCheckoutSession(plan);
      }
      throw err;
    }
  },

  getCurrentPlan: async () => {
    const response = await api.get('/api/user/plans');
    return response.data;
  },

  // FIX: this used to fall back to selectPlan() on ANY error — so a broken
  // or declined checkout silently upgraded the user for free. Errors now
  // propagate to the caller.
  createCheckoutSession: async (plan) => {
    const response = await api.post('/api/user/checkout', { plan });
    if (response.data?.url) {
      window.location.href = response.data.url;
      return { success: true, redirecting: true };
    }
    throw new Error('Checkout did not return a payment URL');
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