const request = require('supertest');
const app = require('../src/app');
const { getRedis } = require('../src/config/redis');

jest.mock('../src/services/rateLimit.service', () => ({
  checkIpLimit: jest.fn().mockResolvedValue(false)
}));

describe('Universal API Hub - Integration Tests', () => {
  describe('Global Configuration', () => {
    it('should return 404 for unknown routes', async () => {
      const res = await request(app).get('/api/unknown/route');
      expect(res.statusCode).toBe(404);
    });

    it('should enforce 100kb payload size limit globally', async () => {
      const largePayload = { data: 'a'.repeat(1024 * 150) };
      const res = await request(app).post('/auth/login').send(largePayload);
      expect(res.statusCode).toBe(413); // Payload Too Large
    });
  });

  describe('Health Checks', () => {
    it('should return ok for /health', async () => {
      const res = await request(app).get('/health');
      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('ok');
    });
  });

  afterAll(async () => {
    // Close redis to prevent Jest hanging
    const redis = getRedis();
    if (redis && redis.status !== 'end') {
      await redis.quit();
    }
  });
});
