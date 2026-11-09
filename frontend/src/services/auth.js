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

  google: async (credential) => {
    const response = await api.post('/auth/google', { credential });
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
   * Change plan. During a free beta this switches immediately. Otherwise the
   * backend answers 402 { checkoutRequired } for upgrades and we take the
   * payment with Razorpay Checkout; it resolves once the server has
   * confirmed the payment and given the plan.
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
        return planService.checkout(plan);
      }
      throw err;
    }
  },

  getCurrentPlan: async () => {
    const response = await api.get('/api/user/plans');
    return response.data;
  },

  /** Pay for a plan with Razorpay. Rejects with "Payment cancelled" if the window is closed. */
  checkout: async (plan) => {
    const [{ data }] = await Promise.all([api.post('/api/user/checkout', { plan }), loadRazorpay()]);
    return openRazorpay(data.checkout);
  },
};

export const walletService = {
  get: async () => (await api.get('/api/user/wallet')).data,

  /** Add `amountInr` of AI credits. Resolves with the new balance once the server confirms. */
  topup: async (amountInr) => {
    const [{ data }] = await Promise.all([api.post('/api/user/wallet/topup', { amountInr }), loadRazorpay()]);
    return openRazorpay(data.checkout);
  },
};

/**
 * Open Razorpay Checkout for an order the server created, and confirm the
 * payment with the server when it succeeds. Only the public key id reaches
 * the browser; the secret never leaves the server.
 */
function openRazorpay(c) {
  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay({
      key: c.keyId,
      order_id: c.orderId,
      amount: c.amount,
      currency: c.currency,
      name: c.name,
      description: c.description,
      prefill: c.prefill,
      theme: { color: '#6366f1' },
      handler: async (resp) => {
        try {
          const { data: v } = await api.post('/api/user/checkout/verify', {
            orderId: resp.razorpay_order_id,
            paymentId: resp.razorpay_payment_id,
            signature: resp.razorpay_signature,
          });
          if (v.token) localStorage.setItem('auth_token', v.token);
          resolve({ success: true, paid: true, kind: v.kind, plan: v.plan, planExpiresAt: v.planExpiresAt, balancePaise: v.balancePaise });
        } catch (e) {
          reject(e);
        }
      },
      modal: { ondismiss: () => reject(Object.assign(new Error('Payment cancelled'), { cancelled: true })) },
    });
    rzp.on('payment.failed', (r) => {
      // Razorpay keeps its window open so the user can retry; just note it.
      console.warn('Razorpay payment failed', r?.error?.reason);
    });
    rzp.open();
  });
}

let razorpayScript = null;
function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve();
  if (!razorpayScript) {
    razorpayScript = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://checkout.razorpay.com/v1/checkout.js';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        razorpayScript = null;
        reject(new Error('Could not load the payment window. Check your connection and try again.'));
      };
      document.body.appendChild(s);
    });
  }
  return razorpayScript;
}

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