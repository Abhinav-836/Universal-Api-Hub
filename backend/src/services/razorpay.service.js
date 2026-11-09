// backend/src/services/razorpay.service.js
//
// A thin client for the parts of Razorpay's REST API we use (orders,
// payments) plus the two signature checks. No SDK: plain HTTPS with the key
// id + secret as Basic auth, so there's nothing extra to install or audit.
//
// Env:
//   RAZORPAY_KEY_ID          rzp_test_… or rzp_live_…   (safe to show the browser)
//   RAZORPAY_KEY_SECRET      never leaves the server
//   RAZORPAY_WEBHOOK_SECRET  the secret you type when adding the webhook
const crypto = require('crypto');
const axios = require('axios');

const BASE = 'https://api.razorpay.com/v1';

const keyId = () => process.env.RAZORPAY_KEY_ID || '';
const keySecret = () => process.env.RAZORPAY_KEY_SECRET || '';

const isConfigured = () => /^rzp_(test|live)_[A-Za-z0-9]{8,}$/.test(keyId()) && keySecret().length >= 16;
const isTestMode = () => keyId().startsWith('rzp_test_');

const client = () =>
  axios.create({
    baseURL: BASE,
    auth: { username: keyId(), password: keySecret() },
    timeout: 15000,
  });

/** Compare two hex strings in constant time. */
function safeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

const RazorpayService = {
  isConfigured,
  isTestMode,
  publicKeyId: keyId,

  /** amount in paise. notes are stored on the order (shown in your Razorpay dashboard). */
  async createOrder({ amount, currency = 'INR', receipt, notes }) {
    const { data } = await client().post('/orders', { amount, currency, receipt, notes });
    return data; // { id: 'order_…', amount, currency, status, … }
  },

  async fetchPayment(paymentId) {
    const { data } = await client().get(`/payments/${encodeURIComponent(paymentId)}`);
    return data; // { id, order_id, amount, currency, status: created|authorized|captured|failed|refunded, … }
  },

  async capturePayment(paymentId, amount, currency = 'INR') {
    const { data } = await client().post(`/payments/${encodeURIComponent(paymentId)}/capture`, { amount, currency });
    return data;
  },

  /** The signature Checkout returns: HMAC-SHA256("order_id|payment_id", key secret). */
  verifyCheckoutSignature(orderId, paymentId, signature) {
    if (!orderId || !paymentId || !signature || !keySecret()) return false;
    const expected = crypto.createHmac('sha256', keySecret()).update(`${orderId}|${paymentId}`).digest('hex');
    return safeEqualHex(expected, String(signature));
  },

  /** Webhooks: HMAC-SHA256(raw request body, webhook secret) in X-Razorpay-Signature. */
  verifyWebhookSignature(rawBody, signature) {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || '';
    if (!secret || !signature || !rawBody) return false;
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    return safeEqualHex(expected, String(signature));
  },
};

module.exports = RazorpayService;
