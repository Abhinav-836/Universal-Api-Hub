// Prepaid AI credits: price per call, who gets paid models, charging after
// each OpenRouter call, and top-ups through Razorpay.
const mockState = { users: {}, tx: [] };
const mockDb = {
  query: jest.fn(async (sql, p = []) => {
    if (/SELECT credit_paise FROM users/.test(sql)) return { rows: mockState.users[p[0]] ? [{ credit_paise: String(mockState.users[p[0]].credit) }] : [] };
    if (/UPDATE users SET credit_paise = credit_paise \+ \$2/.test(sql)) { const u = mockState.users[p[0]]; u.credit += p[1]; return { rows: [{ credit_paise: String(u.credit) }] }; }
    if (/UPDATE users SET credit_paise = credit_paise - \$2/.test(sql)) { const u = mockState.users[p[0]]; if (!u) return { rows: [] }; u.credit -= p[1]; return { rows: [{ credit_paise: String(u.credit) }] }; }
    if (/INSERT INTO wallet_transactions/.test(sql)) { mockState.tx.push({ sql, p }); return { rows: [] }; }
    if (/FROM wallet_transactions WHERE user_id/.test(sql)) return { rows: [] };
    throw new Error('unexpected SQL ' + sql.slice(0, 50));
  }),
};
mockDb.withTransaction = jest.fn(async (fn) => fn({ query: mockDb.query }));
jest.mock('../src/config/db', () => mockDb);
jest.mock('axios');

const axios = require('axios');
const Wallet = require('../src/services/wallet.service');
const LlmService = require('../src/services/llm.service');
const { runWithBilling } = require('../src/utils/billingContext');

beforeEach(() => {
  jest.clearAllMocks();
  mockState.users = { u1: { credit: 50000 }, poor: { credit: 100 } };
  mockState.tx = [];
  delete process.env.AI_USD_INR; delete process.env.AI_MARGIN; delete process.env.WALLET_MIN_INR;
  process.env.OPENROUTER_API_KEY = 'sk-or-v1-realkeyrealkeyrealkey';
});

describe('price per call', () => {
  it('is OpenRouter cost × ₹90 × 1.25, rounded up to the paisa; free models cost nothing', () => {
    expect(Wallet.priceForUsd(0.002)).toBe(23);      // 0.002 × 90 × 1.25 = ₹0.225 → 23 paise
    expect(Wallet.priceForUsd(0.0000001)).toBe(1);   // tiny but not free → 1 paisa
    expect(Wallet.priceForUsd(0)).toBe(0);
    expect(Wallet.priceForUsd(undefined)).toBe(0);
  });
  it('follows AI_USD_INR and AI_MARGIN', () => {
    process.env.AI_USD_INR = '100'; process.env.AI_MARGIN = '2';
    expect(Wallet.priceForUsd(0.01)).toBe(200);
  });
});

describe('who gets paid models', () => {
  it('paid plan + credit → plan models; no credit or free plan → free models', async () => {
    expect(await Wallet.aiPlanFor({ id: 'u1', plan: 'premium' })).toBe('premium');
    expect(await Wallet.aiPlanFor({ id: 'poor', plan: 'premium' })).toBe('free'); // ₹1 < ₹2 minimum
    expect(await Wallet.aiPlanFor({ id: 'u1', plan: 'free' })).toBe('free');
    expect(await Wallet.aiPlanFor(null)).toBe('free');
  });
});

describe('charging after an OpenRouter call', () => {
  const reply = (cost) => ({ data: { model: 'openai/gpt-4o', choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }], usage: { total_tokens: 20, cost } } });

  it('takes the call\'s cost from the wallet of the user making the request', async () => {
    axios.post.mockResolvedValue(reply(0.004));
    const ctx = { userId: 'u1', endpoint: '/api/v1/chat' };
    await runWithBilling(ctx, () => LlmService.complete({ messages: [{ role: 'user', content: 'hi' }], models: ['openai/gpt-4o'] }));
    expect(ctx.chargedPaise).toBe(45); // 0.004 × 90 × 1.25 = 0.45
    expect(mockState.users.u1.credit).toBe(50000 - 45);
    const tx = mockState.tx[0].p; // [user, -paise, endpoint, model, cost, balance]
    expect(tx).toEqual(['u1', -45, '/api/v1/chat', 'openai/gpt-4o', 0.004, 49955]);
  });

  it('does not charge free models, or calls outside a request', async () => {
    axios.post.mockResolvedValue(reply(0));
    await runWithBilling({ userId: 'u1' }, () => LlmService.complete({ messages: [], models: ['x:free'] }));
    axios.post.mockResolvedValue(reply(0.01));
    await LlmService.complete({ messages: [], models: ['openai/gpt-4o'] });
    expect(mockState.users.u1.credit).toBe(50000);
    expect(mockState.tx).toHaveLength(0);
  });
});

describe('top-ups', () => {
  it('adds the paid amount and records it', async () => {
    const after = await Wallet.credit('u1', 25000, { kind: 'topup', ref: 'order_X' });
    expect(after).toBe(75000);
    expect(mockState.tx[0].p).toEqual(['u1', 25000, 'topup', 'order_X', 75000]);
  });
});
