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
    
    // Try to get token from cookie (name: 'jwt') or Authorization header
    let token = cookies.jwt || cookies.token; // Support both names
    
    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }
    
    if (!token) {
      logger.debug('No token found', { 
        hasCookie: !!req.headers.cookie,
        cookies: Object.keys(cookies),
        hasAuth: !!req.headers.authorization
      });
      return res.status(401).json({ 
        success: false, 
        error: 'Authentication required. Please log in.' 
      });
    }

    // Verify token
    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ 
          success: false, 
          error: 'Token expired. Please log in again.' 
        });
      }
      if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({ 
          success: false, 
          error: 'Invalid token. Please log in again.' 
        });
      }
      throw err;
    }

    // Ensure payload has userId
    if (!payload.userId) {
      logger.warn('Invalid token payload - missing userId', { payload });
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid token payload' 
      });
    }

    // Fetch user (with caching)
    const redis = getRedis();
    const cacheKey = KEYS.userCache(payload.userId);
    let user;
    
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        user = JSON.parse(cached);
        logger.debug('User found in cache', { userId: payload.userId });
      }
    } catch (_) { /* ignore */ }

    if (!user) {
      user = await UserModel.findById(payload.userId);
      if (!user) {
        logger.warn('User not found', { userId: payload.userId });
        return res.status(401).json({ 
          success: false, 
          error: 'User not found' 
        });
      }
      
      try {
        await redis.set(cacheKey, JSON.stringify(user), 'EX', TTL.FIVE_MINUTES);
        logger.debug('User cached', { userId: payload.userId });
      } catch (_) { /* ignore */ }
    }

    req.user = user;
    next();
  } catch (err) {
    logger.error('JWT auth error', { 
      error: err.message, 
      stack: err.stack,
      path: req.path 
    });
    return res.status(401).json({ 
      success: false, 
      error: 'Authentication failed' 
    });
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
      return res.status(401).json({ 
        success: false, 
        error: 'API key required. Pass it in X-API-Key header.' 
      });
    }

    if (!rawKey.startsWith('uhb_')) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid API key format' 
      });
    }

    const keyRecord = await ApiKeyService.findByRawKey(rawKey);
    if (!keyRecord) {
      logger.warn('Invalid API key attempt', { 
        ip: req.ip, 
        prefix: rawKey.substring(0, 12) 
      });
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid or expired API key' 
      });
    }

    if (!keyRecord.user_active) {
      return res.status(403).json({ 
        success: false, 
        error: 'Account suspended' 
      });
    }

    // Attach to request
    req.apiKey = keyRecord;
    req.user = { id: keyRecord.user_id, plan: keyRecord.plan };

    // Fire-and-forget last used update
    ApiKeyService.touchLastUsed(keyRecord.id).catch(() => {});

    next();
  } catch (err) {
    logger.error('API key auth error', { error: err.message });
    return res.status(500).json({ 
      success: false, 
      error: 'Authentication error' 
    });
  }
};

module.exports = { jwtAuth, apiKeyAuth };