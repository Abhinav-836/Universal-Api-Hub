// backend/src/config/env.js
const logger = require('../utils/logger');

const requiredEnvs = [
  'DATABASE_URL',
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

  // Allow DB_HOST instead of DATABASE_URL if in dev
  if (missing.includes('DATABASE_URL') && process.env.DB_HOST) {
    missing.splice(missing.indexOf('DATABASE_URL'), 1);
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
    // Log to stderr (always visible)
    console.error(msg);
    // Also try to log via logger if available
    if (logger && logger.error) {
      logger.error(msg);
    }
    throw new Error(msg);   // Stop the server with a clear error
  }
};

module.exports = { validateEnv };