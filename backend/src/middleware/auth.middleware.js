// backend/src/middleware/auth.middleware.js
const jwt = require('jsonwebtoken');
const ApiKeyService = require('../services/apiKey.service');
const UserModel = require('../models/user.model');
const { getRedis, KEYS, TTL } = require('../config/redis');
const logger = require('../utils/logger');
const { JWT_SECRET } = require('../config/jwt');

const parseCookies = (cookieHeader) => {
  if (!cookieHeader) return {};
  return cookieHeader.split(';').reduce((acc, cookie) => {
    const [key, val] = cookie.split('=').map(c => c.trim());
    acc[key] = val;
    return acc;
  }, {});
};

/**
 * JWT auth — for dashboard/user routes
 */
const jwtAuth = async (req, res, next) => {
  try {
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies.jwt || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.split(' ')[1] : null);
    
    if (!token) {
      return res.status(401).json({ success: false, error: 'Authorization token required' });
    }
    const payload = jwt.verify(token, JWT_SECRET);

    // Fetch user (with caching)
    const redis = getRedis();
    const cacheKey = KEYS.userCache(payload.userId);
    let user;
    try {
      const cached = await redis.get(cacheKey);
      if (cached) user = JSON.parse(cached);
    } catch (_) { /* ignore */ }

    if (!user) {
      user = await UserModel.findById(payload.userId);
      if (!user) return res.status(401).json({ success: false, error: 'User not found' });
      try {
        await redis.set(cacheKey, JSON.stringify(user), 'EX', TTL.FIVE_MINUTES);
      } catch (_) { /* ignore */ }
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, error: 'Token expired' });
    }
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }
};

/**
 * API Key auth — for /api/v1/* endpoints
 * Attaches req.apiKey, req.user to request
 */
const apiKeyAuth = async (req, res, next) => {
  try {
    const rawKey =
      req.headers['x-api-key'] ||
      req.headers['authorization']?.replace('Bearer ', '');

    if (!rawKey) {
      return res.status(401).json({ success: false, error: 'API key required. Pass it in X-API-Key header.' });
    }

    if (!rawKey.startsWith('uhb_')) {
      return res.status(401).json({ success: false, error: 'Invalid API key format' });
    }

    const keyRecord = await ApiKeyService.findByRawKey(rawKey);
    if (!keyRecord) {
      logger.warn('Invalid API key attempt', { ip: req.ip, prefix: rawKey.substring(0, 12) });
      return res.status(401).json({ success: false, error: 'Invalid or expired API key' });
    }

    if (!keyRecord.user_active) {
      return res.status(403).json({ success: false, error: 'Account suspended' });
    }

    // Attach to request
    req.apiKey = keyRecord;
    req.user = { id: keyRecord.user_id, plan: keyRecord.plan };

    // Fire-and-forget last used update
    ApiKeyService.touchLastUsed(keyRecord.id).catch(() => {});

    next();
  } catch (err) {
    logger.error('API key auth error', { error: err.message });
    return res.status(500).json({ success: false, error: 'Authentication error' });
  }
};

module.exports = { jwtAuth, apiKeyAuth };
