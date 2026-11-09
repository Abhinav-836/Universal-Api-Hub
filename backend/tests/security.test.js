// CORS split, error messages that don't leak internals, AI model limits, and news.
const request = require('supertest');

jest.mock('../src/services/rateLimit.service', () => ({ checkIpLimit: jest.fn().mockResolvedValue(false) }));

process.env.NODE_ENV = 'production';
const app = require('../src/app');
const { errorHandler } = require('../src/middleware/errorHandler');
const { hasActivePaidPlan } = require('../src/utils/plan');
const LlmService = require('../src/services/llm.service');
const News = require('../src/services/news.service');
const { getRedis } = require('../src/config/redis');

afterAll(async () => {
  process.env.NODE_ENV = 'test';
  const redis = getRedis();
  if (redis && redis.status !== 'end') await redis.quit();
});

describe('CORS', () => {
  it('lets any website call the public API from the browser (with an API key, no cookies)', async () => {
    const res = await request(app)
      .options('/api/v1/weather')
      .set('Origin', 'https://someones-app.example')
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'x-api-key');
    expect(res.statusCode).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
    expect(res.headers['access-control-allow-headers']).toMatch(/X-API-Key/i);
  });

  it('keeps sign-in, dashboard and billing closed to other websites', async () => {
    for (const path of ['/auth/login', '/api/user/dashboard', '/api/user/checkout']) {
      const res = await request(app)
        .options(path)
        .set('Origin', 'https://evil.example')
        .set('Access-Control-Request-Method', 'POST');
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    }
    const own = await request(app)
      .options('/auth/login')
      .set('Origin', 'https://universal-api-hub.vercel.app')
      .set('Access-Control-Request-Method', 'POST');
    expect(own.headers['access-control-allow-origin']).toBe('https://universal-api-hub.vercel.app');
    expect(own.headers['access-control-allow-credentials']).toBe('true');
  });
});

describe('errors do not leak internals in production', () => {
  const run = (err) => {
    const res = { status: jest.fn(() => res), json: jest.fn() };
    errorHandler(err, { path: '/x', method: 'GET', ip: '1.1.1.1' }, res, () => {});
    return res.json.mock.calls[0][0];
  };
  it('hides 500 messages and stacks', () => {
    const body = run(new Error('relation "users" does not exist at /srv/app/src/models/user.model.js:12'));
    expect(body.error).toBe('Something went wrong. Please try again.');
    expect(body.stack).toBeUndefined();
  });
  it('keeps 4xx messages, which are meant for users', () => {
    expect(run(Object.assign(new Error('Symbol not found'), { statusCode: 404 })).error).toBe('Symbol not found');
  });
  it('404s do not echo the request back', async () => {
    const res = await request(app).get('/some/secret/path');
    expect(res.statusCode).toBe(404);
    expect(JSON.stringify(res.body)).not.toMatch(/secret/);
  });
});

describe('paid plan time', () => {
  const future = new Date(Date.now() + 86400000).toISOString();
  const past = new Date(Date.now() - 1000).toISOString();
  it.each([
    [{ plan: 'free' }, false],
    [{ plan: 'premium', plan_expires_at: null }, false],       // beta / granted for free
    [{ plan: 'premium', plan_expires_at: past }, false],       // paid time ran out
    [{ plan: 'pro', plan_expires_at: future }, true],
  ])('%j → %s', (user, expected) => {
    expect(hasActivePaidPlan(user)).toBe(expected);
  });

  it('image analysis for non-paying users only uses a free vision model, if one is set', () => {
    delete process.env.OPENROUTER_MODEL_VISION_FREE;
    expect(LlmService.getVisionModels('free')).toEqual([]);
    process.env.OPENROUTER_MODEL_VISION_FREE = 'some/vision-model:free';
    expect(LlmService.getVisionModels('free')).toEqual(['some/vision-model:free']);
    expect(LlmService.getVisionModels('premium').length).toBeGreaterThan(0);
  });
});

describe('news', () => {
  const { gdeltQuery, gdeltDate, provider } = News._internals;
  it('uses GDELT unless a paid NewsAPI plan is declared', () => {
    delete process.env.NEWS_PROVIDER;
    process.env.NEWS_API_KEY = 'k';
    expect(provider()).toBe('gdelt');
    process.env.NEWS_PROVIDER = 'newsapi';
    expect(provider()).toBe('newsapi');
    delete process.env.NEWS_PROVIDER;
  });
  it('builds a safe GDELT query', () => {
    expect(gdeltQuery({ q: 'electric cars', category: 'technology', country: 'in' }))
      .toBe('"electric cars" technology sourcecountry:india sourcelang:english');
    expect(gdeltQuery({ q: 'x") OR (y', country: 'zz' })).toBe('"x OR y" sourcelang:english');
    expect(gdeltQuery({})).toBe('news sourcelang:english');
  });
  it('reads GDELT dates', () => {
    expect(gdeltDate('20261109T083000Z')).toBe('2026-11-09T08:30:00Z');
    expect(gdeltDate('nonsense')).toBeNull();
  });
});
