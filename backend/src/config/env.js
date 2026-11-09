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

  // Payments (Razorpay) are optional: without RAZORPAY_KEY_ID /
  // RAZORPAY_KEY_SECRET the server runs and paid upgrades are switched off.

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