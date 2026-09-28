// backend/src/config/env.js
const logger = require('../utils/logger');

const requiredEnvs = [
  'JWT_SECRET',
  'PEPPER',
  'API_KEY_SECRET'
];

const validateEnv = () => {
  const missing = [];
  for (const env of requiredEnvs) {
    if (!process.env[env]) {
      missing.push(env);
    }
  }

  // Require DATABASE_URL OR DB_HOST
  if (!process.env.DATABASE_URL && !process.env.DB_HOST) {
    missing.push('DATABASE_URL (or DB_HOST)');
  }

  // Require Stripe only in production
  if (process.env.NODE_ENV === 'production') {
    const stripeEnvs = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PRICE_ID_PRO', 'STRIPE_PRICE_ID_PREMIUM'];
    for (const env of stripeEnvs) {
      if (!process.env[env]) {
        missing.push(env);
      }
    }
  }

  if (missing.length > 0) {
    const msg = `FATAL: Missing required environment variables: ${missing.join(', ')}`;
    console.error(msg);
    if (logger && logger.error) {
      logger.error(msg);
    }
    throw new Error(msg);
  }
};

module.exports = { validateEnv };