// OpenRouter → Ollama backup, and who pays for backup calls.
jest.mock('axios');
const mockRedis = { store: {}, get: jest.fn(async (k) => mockRedis.store[k] ?? null), incrby: jest.fn(async (k, n) => { mockRedis.store[k] = String(Number(mockRedis.store[k] || 0) + n); }), expire: jest.fn() };
jest.mock('../src/config/redis', () => ({ getRedis: () => mockRedis }));
const mockCharges = [];
jest.mock('../src/services/wallet.service', () => ({
  chargeAiCall: jest.fn(async (c) => { mockCharges.push(c); return Math.ceil(c.costUsd * 104 * 1.25 * 100); }),
}));

const axios = require('axios');
const LlmService = require('../src/services/llm.service');
const Ollama = require('../src/services/ollama.service');
const { runWithBilling } = require('../src/utils/billingContext');

const httpErr = (status) => Object.assign(new Error(`HTTP ${status}`), { response: { status, data: {} } });
const orOk = (model, cost) => ({ data: { model, choices: [{ message: { content: `hi from ${model}` }, finish_reason: 'stop' }], usage: { cost } } });
const ollamaOk = (model) => ({ data: { model, choices: [{ message: { content: `hi from ${model}` }, finish_reason: 'stop' }], usage: { prompt_tokens: 1000, completion_tokens: 1000 } } });
const isOllama = (url) => String(url).startsWith('https://ollama.com/');

beforeEach(() => {
  jest.clearAllMocks();
  mockCharges.length = 0;
  mockRedis.store = {};
  process.env.OPENROUTER_API_KEY = 'sk-or-v1-realkeyrealkeyrealkey';
  process.env.OLLAMA_API_KEY = 'ollama_test_key_0123456789abcdef';
  delete process.env.OLLAMA_MODELS;
  delete process.env.OLLAMA_FREE_DAILY_USD;
});

const msgs = [{ role: 'user', content: 'hi' }];

it('a rate-limited model no longer stops the request: the next OpenRouter model answers', async () => {
  axios.post.mockRejectedValueOnce(httpErr(429)).mockResolvedValueOnce(orOk('b:free', 0));
  const r = await LlmService.complete({ messages: msgs, models: ['a:free', 'b:free'] });
  expect(r).toMatchObject({ source: 'openrouter', model: 'b:free' });
});

it('when every OpenRouter model fails, Ollama answers', async () => {
  axios.post.mockImplementation(async (url, body) => (isOllama(url) ? ollamaOk(body.model) : Promise.reject(httpErr(429))));
  const r = await LlmService.complete({ messages: msgs, models: ['a:free', 'b:free'] });
  expect(r).toMatchObject({ source: 'ollama', model: 'ollama/gpt-oss:120b' });
  const call = axios.post.mock.calls.find(([u]) => isOllama(u));
  expect(call[0]).toBe('https://ollama.com/v1/chat/completions');
  expect(call[2].headers.Authorization).toBe('Bearer ollama_test_key_0123456789abcdef');
});

it('paying customers are charged for Ollama calls at Ollama\'s token prices', async () => {
  axios.post.mockImplementation(async (url, body) => (isOllama(url) ? ollamaOk(body.model) : Promise.reject(httpErr(500))));
  const ctx = { userId: 'u1', endpoint: '/api/v1/chat', aiPlan: 'premium' };
  await runWithBilling(ctx, () => LlmService.complete({ messages: msgs, models: ['openai/gpt-x'] }));
  // gpt-oss:120b: 1000 in × $0.15/M + 1000 out × $0.60/M = $0.00075
  expect(mockCharges[0]).toMatchObject({ userId: 'u1', model: 'ollama/gpt-oss:120b' });
  expect(mockCharges[0].costUsd).toBeCloseTo(0.00075, 8);
  expect(mockRedis.incrby).not.toHaveBeenCalled(); // not from the owner's budget
});

it('non-paying calls come out of the owner\'s daily budget, and stop when it is used up', async () => {
  process.env.OLLAMA_FREE_DAILY_USD = '0.001';
  axios.post.mockImplementation(async (url, body) => (isOllama(url) ? ollamaOk(body.model) : Promise.reject(httpErr(429))));
  const ctx = { userId: 'u2', aiPlan: 'free' };
  await runWithBilling(ctx, () => LlmService.complete({ messages: msgs, models: ['a:free'] }));
  expect(mockCharges).toHaveLength(0);
  await runWithBilling(ctx, () => LlmService.complete({ messages: msgs, models: ['a:free'] })); // $0.0015 spent now
  await expect(runWithBilling(ctx, () => LlmService.complete({ messages: msgs, models: ['a:free'] })))
    .rejects.toMatchObject({ statusCode: 503 });
});

it('images go only to Ollama models that can see', async () => {
  axios.post.mockImplementation(async (url, body) => (isOllama(url) ? ollamaOk(body.model) : Promise.reject(httpErr(404))));
  const img = [{ role: 'user', content: [{ type: 'text', text: 'what is this' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }] }];
  const r = await LlmService.complete({ messages: img, models: ['v:free'] });
  expect(r.model).toBe('ollama/gemma4:31b');
});

it('without an Ollama key, a full OpenRouter failure is a 503 as before', async () => {
  delete process.env.OLLAMA_API_KEY;
  axios.post.mockRejectedValue(httpErr(404));
  await expect(LlmService.complete({ messages: msgs, models: ['a', 'b'] })).rejects.toMatchObject({ statusCode: 503, code: 'ALL_MODELS_REJECTED' });
});

it('unknown Ollama models are priced high so nobody is under-charged', () => {
  expect(Ollama.costUsd('some-new-model', { prompt_tokens: 1e6, completion_tokens: 0 })).toBe(3);
});
