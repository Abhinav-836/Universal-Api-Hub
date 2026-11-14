// Razorpay payments: signatures, the confirm step, plan time, expiry, and the routes.
const crypto = require('crypto');
const request = require('supertest');

jest.mock('../src/services/rateLimit.service', () => ({ checkIpLimit: jest.fn().mockResolvedValue(false) }));
jest.mock('../src/models/api.model', () => ({ syncAccessForPlan: jest.fn(), findAll: jest.fn().mockResolvedValue([]) }));
jest.mock('../src/services/plan.service', () => ({
  invalidateUserCaches: jest.fn(),
  applyPlanChange: jest.fn(async (id, plan, exp) => ({ id, plan, plan_expires_at: exp })),
}));

// ── A tiny in-memory stand-in for the two tables billing touches ──
const mockStore = { payments: [], users: [] };
const mockDb = {
  query: jest.fn(async (sql, params = []) => {
    if (/^INSERT INTO payments/.test(sql)) {
      mockStore.payments.push({ user_id: params[0], plan: params[1], amount: params[2], currency: 'INR', order_id: params[3], status: 'created', payment_id: null, created_at: new Date() });
      return { rows: [] };
    }
    if (/pg_advisory_xact_lock/.test(sql)) return { rows: [{}] };
    if (/SELECT order_id FROM payments/.test(sql)) {
      const cutoff = Date.now() - params[3] * 60 * 1000;
      const open = mockStore.payments
        .filter((p) => p.user_id === params[0] && p.plan === params[1] && p.amount === params[2] && p.status === 'created' && p.created_at.getTime() > cutoff)
        .sort((a, b) => b.created_at - a.created_at);
      return { rows: open.slice(0, 1).map((p) => ({ order_id: p.order_id })) };
    }
    if (/SELECT \* FROM payments WHERE order_id/.test(sql)) return { rows: mockStore.payments.filter((p) => p.order_id === params[0]).map((p) => ({ ...p })) };
    if (/UPDATE payments SET status = 'paid'/.test(sql)) {
      const p = mockStore.payments.find((x) => x.order_id === params[0] && x.status !== 'paid');
      if (!p) return { rows: [] };
      Object.assign(p, { status: 'paid', payment_id: params[1] });
      return { rows: [{ ...p }] };
    }
    if (/SELECT plan, plan_expires_at FROM users/.test(sql)) return { rows: mockStore.users.filter((u) => u.id === params[0]).map((u) => ({ ...u })) };
    if (/UPDATE users SET plan = \$1, plan_expires_at = \$2/.test(sql)) {
      const u = mockStore.users.find((x) => x.id === params[2]);
      Object.assign(u, { plan: params[0], plan_expires_at: params[1] });
      return { rows: [] };
    }
    if (/UPDATE users SET credit_paise = credit_paise \+ \$2/.test(sql)) {
      const u = mockStore.users.find((x) => x.id === params[0]);
      u.credit_paise = (u.credit_paise || 0) + params[1];
      return { rows: [{ credit_paise: String(u.credit_paise) }] };
    }
    if (/INSERT INTO wallet_transactions/.test(sql)) return { rows: [] };
    if (/SELECT id FROM users\s+WHERE plan <> 'free'/.test(sql)) {
      return { rows: mockStore.users.filter((u) => u.plan !== 'free' && u.plan_expires_at && new Date(u.plan_expires_at) < new Date()).map((u) => ({ id: u.id })) };
    }
    throw new Error(`unexpected SQL in test: ${sql.slice(0, 60)}`);
  }),
};
// Transactions run one at a time, like the per-user advisory lock in Postgres.
let mockTxChain = Promise.resolve();
mockDb.withTransaction = jest.fn(async (fn) => {
  const before = mockTxChain;
  let release;
  mockTxChain = new Promise((r) => { release = r; });
  await before;
  try {
    return await fn({ query: mockDb.query });
  } finally {
    release();
  }
});
jest.mock('../src/config/db', () => mockDb);

jest.mock('axios');
const axios = require('axios');

const SECRET = 'test_secret_abcdefghijklmnop';
process.env.RAZORPAY_KEY_ID = 'rzp_test_ABCDEFGH12345';
process.env.RAZORPAY_KEY_SECRET = SECRET;
process.env.RAZORPAY_WEBHOOK_SECRET = 'whsec_test_123456';

const Razorpay = require('../src/services/razorpay.service');
const Billing = require('../src/services/billing.service');
const { applyPlanChange } = require('../src/services/plan.service');
const app = require('../src/app');
const { getRedis } = require('../src/config/redis');

const sign = (orderId, paymentId, secret = SECRET) =>
  crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');

// Razorpay's REST API, faked through axios.create().
const api = { post: jest.fn(), get: jest.fn() };
beforeEach(() => {
  jest.clearAllMocks();
  mockStore.payments = [];
  mockStore.users = [{ id: 'u1', email: 'a@b.com', plan: 'free', plan_expires_at: null }];
  axios.create.mockReturnValue(api);
  api.post.mockImplementation(async (url, body) => {
    if (url === '/orders') return { data: { id: 'order_TEST000001', amount: body.amount, currency: 'INR' } };
    if (/\/capture$/.test(url)) return { data: { id: 'pay_TEST000001', order_id: 'order_TEST000001', amount: 49900, currency: 'INR', status: 'captured' } };
    throw new Error(`unexpected POST ${url}`);
  });
  api.get.mockResolvedValue({ data: { id: 'pay_TEST000001', order_id: 'order_TEST000001', amount: 49900, currency: 'INR', status: 'captured' } });
});

afterAll(async () => {
  const redis = getRedis();
  if (redis && redis.status !== 'end') await redis.quit();
});

describe('signatures', () => {
  it('accepts the checkout signature Razorpay makes and rejects anything else', () => {
    expect(Razorpay.verifyCheckoutSignature('order_A', 'pay_B', sign('order_A', 'pay_B'))).toBe(true);
    expect(Razorpay.verifyCheckoutSignature('order_A', 'pay_B', sign('order_A', 'pay_C'))).toBe(false);
    expect(Razorpay.verifyCheckoutSignature('order_A', 'pay_B', sign('order_A', 'pay_B', 'wrong-secret'))).toBe(false);
    expect(Razorpay.verifyCheckoutSignature('order_A', 'pay_B', 'zz')).toBe(false);
  });

  it('checks webhook signatures over the exact raw body', () => {
    const body = Buffer.from('{"event":"payment.captured"}');
    const sig = crypto.createHmac('sha256', 'whsec_test_123456').update(body).digest('hex');
    expect(Razorpay.verifyWebhookSignature(body, sig)).toBe(true);
    expect(Razorpay.verifyWebhookSignature(Buffer.from('{"event":"payment.captured" }'), sig)).toBe(false);
  });
});

describe('checkout and confirming a payment', () => {
  it('creates an order for the server-side price, never one the browser chose', async () => {
    const c = await Billing.createCheckout({ id: 'u1', email: 'a@b.com' }, 'premium');
    expect(c).toMatchObject({ orderId: 'order_TEST000001', amount: 49900, currency: 'INR', keyId: 'rzp_test_ABCDEFGH12345', days: 30, testMode: true });
    expect(api.post).toHaveBeenCalledWith('/orders', expect.objectContaining({ amount: 49900, currency: 'INR', notes: { userId: 'u1', plan: 'premium' } }));
    expect(mockStore.payments[0]).toMatchObject({ user_id: 'u1', plan: 'premium', amount: 49900, status: 'created' });
    expect(c).not.toHaveProperty('keySecret');
  });

  it('gives 30 days of the plan once the signature AND Razorpay agree', async () => {
    await Billing.createCheckout({ id: 'u1', email: 'a@b.com' }, 'premium');
    const before = Date.now();
    const r = await Billing.verifyCheckout({ id: 'u1' }, { orderId: 'order_TEST000001', paymentId: 'pay_TEST000001', signature: sign('order_TEST000001', 'pay_TEST000001') });
    expect(r.alreadyPaid).toBe(false);
    expect(mockStore.users[0].plan).toBe('premium');
    const days = (new Date(mockStore.users[0].plan_expires_at).getTime() - before) / 86400000;
    expect(days).toBeGreaterThan(29.99);
    expect(days).toBeLessThan(30.01);
    expect(api.get).toHaveBeenCalledWith('/payments/pay_TEST000001');

    // Same payment again (e.g. the webhook arriving after the browser): nothing changes.
    const again = await Billing.confirmPayment({ orderId: 'order_TEST000001', paymentId: 'pay_TEST000001' });
    expect(again.alreadyPaid).toBe(true);
  });

  it('adds 30 days on top when the same plan is still running', async () => {
    const tenDays = new Date(Date.now() + 10 * 86400000);
    mockStore.users[0] = { ...mockStore.users[0], plan: 'premium', plan_expires_at: tenDays };
    await Billing.createCheckout({ id: 'u1' }, 'premium');
    await Billing.confirmPayment({ orderId: 'order_TEST000001', paymentId: 'pay_TEST000001' });
    const days = (new Date(mockStore.users[0].plan_expires_at).getTime() - Date.now()) / 86400000;
    expect(Math.round(days)).toBe(40);
  });

  it('refuses a made-up signature', async () => {
    await Billing.createCheckout({ id: 'u1' }, 'premium');
    await expect(Billing.verifyCheckout({ id: 'u1' }, { orderId: 'order_TEST000001', paymentId: 'pay_TEST000001', signature: 'a'.repeat(64) }))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(mockStore.users[0].plan).toBe('free');
  });

  it('refuses someone else\'s order', async () => {
    await Billing.createCheckout({ id: 'u1' }, 'premium');
    await expect(Billing.verifyCheckout({ id: 'u2' }, { orderId: 'order_TEST000001', paymentId: 'pay_TEST000001', signature: sign('order_TEST000001', 'pay_TEST000001') }))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it('refuses a payment for a different amount or order (e.g. a cheaper plan\'s payment)', async () => {
    await Billing.createCheckout({ id: 'u1' }, 'premium');
    api.get.mockResolvedValueOnce({ data: { id: 'pay_TEST000001', order_id: 'order_TEST000001', amount: 19900, currency: 'INR', status: 'captured' } });
    await expect(Billing.confirmPayment({ orderId: 'order_TEST000001', paymentId: 'pay_TEST000001' })).rejects.toMatchObject({ statusCode: 400 });
    api.get.mockResolvedValueOnce({ data: { id: 'pay_TEST000001', order_id: 'order_OTHER00001', amount: 49900, currency: 'INR', status: 'captured' } });
    await expect(Billing.confirmPayment({ orderId: 'order_TEST000001', paymentId: 'pay_TEST000001' })).rejects.toMatchObject({ statusCode: 400 });
    expect(mockStore.users[0].plan).toBe('free');
  });

  it('captures an authorized payment, and refuses a failed one', async () => {
    await Billing.createCheckout({ id: 'u1' }, 'premium');
    api.get.mockResolvedValueOnce({ data: { id: 'pay_TEST000001', order_id: 'order_TEST000001', amount: 49900, currency: 'INR', status: 'failed' } });
    await expect(Billing.confirmPayment({ orderId: 'order_TEST000001', paymentId: 'pay_TEST000001' })).rejects.toMatchObject({ statusCode: 402 });

    api.get.mockResolvedValueOnce({ data: { id: 'pay_TEST000001', order_id: 'order_TEST000001', amount: 49900, currency: 'INR', status: 'authorized' } });
    await Billing.confirmPayment({ orderId: 'order_TEST000001', paymentId: 'pay_TEST000001' });
    expect(api.post).toHaveBeenCalledWith('/payments/pay_TEST000001/capture', { amount: 49900, currency: 'INR' });
    expect(mockStore.users[0].plan).toBe('premium');
  });

  it('webhook payment.captured gives the plan even if the browser never came back', async () => {
    await Billing.createCheckout({ id: 'u1' }, 'premium');
    await Billing.handleWebhook({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_TEST000001', order_id: 'order_TEST000001' } } } });
    expect(mockStore.users[0].plan).toBe('premium');
    // Unknown orders and other events are ignored, not errors.
    await expect(Billing.handleWebhook({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_X', order_id: 'order_NOTOURS' } } } })).resolves.toBe(true);
    await expect(Billing.handleWebhook({ event: 'refund.created' })).resolves.toBe(true);
  });

  it('moves users whose paid time ran out back to free', async () => {
    mockStore.users.push({ id: 'u9', plan: 'pro', plan_expires_at: new Date(Date.now() - 1000) });
    mockStore.users.push({ id: 'u8', plan: 'premium', plan_expires_at: null }); // granted free, no expiry
    expect(await Billing.expirePlans()).toBe(1);
    expect(applyPlanChange).toHaveBeenCalledWith('u9', 'free', null);
  });

  it('a wallet top-up adds credit and does not touch the plan', async () => {
    const c = await Billing.createTopup({ id: 'u1', email: 'a@b.com' }, 250);
    expect(c).toMatchObject({ orderId: 'order_TEST000001', amount: 25000, kind: 'credits' });
    api.get.mockResolvedValueOnce({ data: { id: 'pay_TEST000001', order_id: 'order_TEST000001', amount: 25000, currency: 'INR', status: 'captured' } });
    const r = await Billing.verifyCheckout({ id: 'u1' }, { orderId: 'order_TEST000001', paymentId: 'pay_TEST000001', signature: sign('order_TEST000001', 'pay_TEST000001') });
    expect(r).toMatchObject({ kind: 'credits', creditedPaise: 25000, balancePaise: 25000 });
    expect(mockStore.users[0].plan).toBe('free');
    // The webhook for the same payment changes nothing.
    await Billing.handleWebhook({ event: 'order.paid', payload: { payment: { entity: { id: 'pay_TEST000001', order_id: 'order_TEST000001' } } } });
    expect(mockStore.users[0].credit_paise).toBe(25000);
  });

  it('top-ups must be whole rupees between ₹50 and ₹10,000', async () => {
    for (const bad of [49, 10001, 99.5, 'abc']) {
      await expect(Billing.createTopup({ id: 'u1' }, bad)).rejects.toMatchObject({ statusCode: 400 });
    }
  });

  it('prices come from PRICE_*_INR when set', () => {
    process.env.PRICE_PRO_INR = '249';
    expect(Billing.priceInr('pro')).toBe(249);
    delete process.env.PRICE_PRO_INR;
    expect(Billing.prices()).toEqual({ pro: 199, premium: 499 });
  });
});

describe('paying twice is impossible', () => {
  // Each new Razorpay order gets its own id, so a second order would show up.
  let n;
  beforeEach(() => {
    n = 0;
    api.post.mockImplementation(async (url, body) => {
      if (url === '/orders') return { data: { id: `order_NEW${++n}`, amount: body.amount, currency: 'INR' } };
      throw new Error(`unexpected POST ${url}`);
    });
    api.get.mockImplementation(async (url) => {
      if (/^\/orders\/[^/]+$/.test(url)) return { data: { id: url.split('/')[2], status: 'attempted' } };
      throw new Error(`unexpected GET ${url}`);
    });
  });
  const ordersMade = () => api.post.mock.calls.filter(([url]) => url === '/orders').length;

  it('clicking Pay twice for the same plan gives back the same order', async () => {
    const a = await Billing.createCheckout({ id: 'u1' }, 'premium');
    const b = await Billing.createCheckout({ id: 'u1' }, 'premium');
    expect(b.orderId).toBe(a.orderId);
    expect(ordersMade()).toBe(1);
    expect(mockStore.payments).toHaveLength(1);
  });

  it('two tabs topping up the same amount at once share one order', async () => {
    const [a, b] = await Promise.all([Billing.createTopup({ id: 'u1' }, 250), Billing.createTopup({ id: 'u1' }, 250)]);
    expect(b.orderId).toBe(a.orderId);
    expect(mockStore.payments).toHaveLength(1);
    expect(mockDb.query).toHaveBeenCalledWith(expect.stringMatching(/pg_advisory_xact_lock/), ['uah_pay:u1']);
  });

  it('a different plan, a different amount or another user gets its own order', async () => {
    await Billing.createCheckout({ id: 'u1' }, 'premium');
    await Billing.createCheckout({ id: 'u1' }, 'pro');
    await Billing.createTopup({ id: 'u1' }, 100);
    await Billing.createTopup({ id: 'u1' }, 250);
    await Billing.createCheckout({ id: 'u2' }, 'premium');
    expect(ordersMade()).toBe(5);
  });

  it('after a payment is confirmed, buying again starts a fresh order', async () => {
    const a = await Billing.createTopup({ id: 'u1' }, 250);
    mockStore.payments[0].status = 'paid';
    const b = await Billing.createTopup({ id: 'u1' }, 250);
    expect(b.orderId).not.toBe(a.orderId);
  });

  it('an old unpaid order is not reused', async () => {
    const a = await Billing.createCheckout({ id: 'u1' }, 'premium');
    mockStore.payments[0].created_at = new Date(Date.now() - 31 * 60 * 1000);
    const b = await Billing.createCheckout({ id: 'u1' }, 'premium');
    expect(b.orderId).not.toBe(a.orderId);
  });

  it('if the open order was already paid at Razorpay, it finishes that payment instead of charging again', async () => {
    const a = await Billing.createCheckout({ id: 'u1' }, 'premium');
    api.get.mockImplementation(async (url) => {
      if (url === `/orders/${a.orderId}`) return { data: { id: a.orderId, status: 'paid' } };
      if (url === `/orders/${a.orderId}/payments`) return { data: { items: [{ id: 'pay_LATE1', status: 'captured' }] } };
      if (url === '/payments/pay_LATE1') return { data: { id: 'pay_LATE1', order_id: a.orderId, amount: 49900, currency: 'INR', status: 'captured' } };
      throw new Error(`unexpected GET ${url}`);
    });
    await expect(Billing.createCheckout({ id: 'u1' }, 'premium')).rejects.toMatchObject({ statusCode: 409, alreadyPaid: true });
    expect(ordersMade()).toBe(1);
    expect(mockStore.payments[0].status).toBe('paid');
    expect(mockStore.users[0].plan).toBe('premium');
  });

  it('if Razorpay cannot be reached, the same order is still handed back (Razorpay refuses a second payment on it)', async () => {
    const a = await Billing.createCheckout({ id: 'u1' }, 'premium');
    api.get.mockRejectedValue(Object.assign(new Error('timeout'), { response: { status: 503 } }));
    const b = await Billing.createCheckout({ id: 'u1' }, 'premium');
    expect(b.orderId).toBe(a.orderId);
  });
});

describe('routes', () => {
  it('webhook without a valid signature is refused', async () => {
    const res = await request(app).post('/webhook/razorpay').set('Content-Type', 'application/json').send('{"event":"payment.captured"}');
    expect(res.statusCode).toBe(400);
  });

  it('webhook with a valid signature is accepted', async () => {
    const body = JSON.stringify({ event: 'refund.created' });
    const sig = crypto.createHmac('sha256', 'whsec_test_123456').update(body).digest('hex');
    const res = await request(app).post('/webhook/razorpay').set('Content-Type', 'application/json').set('X-Razorpay-Signature', sig).send(body);
    expect(res.statusCode).toBe(200);
  });

  it('checkout needs a signed-in user', async () => {
    expect((await request(app).post('/api/user/checkout').send({ plan: 'pro' })).statusCode).toBe(401);
    expect((await request(app).get('/api/user/dashboard')).statusCode).toBe(401);
  });
});