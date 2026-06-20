// backend/src/config/jwt.js — Single source of truth for JWT config
const isDev = (process.env.NODE_ENV || 'development') !== 'production';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

if (!JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET env var must be set. Refusing to start for security reasons.');
}

module.exports = { JWT_SECRET, JWT_EXPIRES_IN };
