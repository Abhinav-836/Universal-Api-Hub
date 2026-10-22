const request = require('supertest');
const app = require('../src/app');
const { getRedis } = require('../src/config/redis');
const UserModel = require('../src/models/user.model');
const jwt = require('jsonwebtoken');

// Mock Models and Services
jest.mock('../src/models/user.model');
jest.mock('../src/services/rateLimit.service', () => ({
  checkIpLimit: jest.fn().mockResolvedValue(false),
  checkAndIncrement: jest.fn().mockResolvedValue({ allowed: true, limit: 10, used: 1, remaining: 9 }),
  refund: jest.fn().mockResolvedValue(undefined),
}));

describe('Stripe Webhook and Checkout', () => {
  let token;

  beforeAll(() => {
    const { JWT_SECRET } = require('../src/config/jwt');
    token = jwt.sign({ userId: 'user-123' }, JWT_SECRET);
    UserModel.findById.mockResolvedValue({ id: 'user-123', email: 'test@example.com', is_active: true });
  });

  afterAll(async () => {
    const redis = getRedis();
    if (redis && redis.status !== 'end') await redis.quit();
  });

  describe('POST /api/user/checkout', () => {
    it('should return 400 for invalid plan', async () => {
      const res = await request(app)
        .post('/api/user/checkout')
        .set('Cookie', [`jwt=${token}`])
        .send({ plan: 'invalid_plan' });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return 501 when Stripe is not configured with a real key', async () => {
      // jest.setup.js uses the fake key "sk_test_123", which must NOT be
      // treated as a configured Stripe account.
      const res = await request(app)
        .post('/api/user/checkout')
        .set('Cookie', [`jwt=${token}`])
        .send({ plan: 'pro' });

      expect(res.statusCode).toBe(501);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /webhook/stripe', () => {
    it('should return 400 if signature is missing', async () => {
      const res = await request(app)
        .post('/webhook/stripe')
        .send({});

      expect(res.statusCode).toBe(400);
    });
  });
});