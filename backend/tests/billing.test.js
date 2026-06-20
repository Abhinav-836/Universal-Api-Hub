const request = require('supertest');
const app = require('../src/app');

describe('Billing & Rate Limit Subsystems', () => {
  it('should deny webhook without signature', async () => {
    const res = await request(app)
      .post('/webhook/stripe')
      .send({ type: 'customer.subscription.created' });

    // Missing signature/configuration
    expect(res.statusCode).toBe(400);
    expect(res.text).toContain('Webhook Error:');
  });

  it('should enforce fallback degraded mode when Redis is unmocked but missing auth', async () => {
    // A simple endpoint that requires auth
    const res = await request(app).get('/api/user/dashboard');
    expect(res.statusCode).toBe(401);
  });
});
