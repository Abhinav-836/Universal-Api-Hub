// backend/src/middleware/rateLimiter.js
const RateLimitService = require('../services/rateLimit.service');
const UsageService = require('../services/usage.service');

const emergencyMemoryCache = new Map();

// Cleanup emergency memory cache periodically to prevent leaks
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, val] of emergencyMemoryCache.entries()) {
    if (now > val.resetAt) emergencyMemoryCache.delete(key);
  }
}, 60000);

if (cleanupInterval.unref) cleanupInterval.unref();
const logger = require('../utils/logger');

/**
 * IP-based abuse protection (applied globally)
 */
const ipRateLimit = async (req, res, next) => {
  try {
    const ip = req.ip || req.socket.remoteAddress;
    const blocked = await RateLimitService.checkIpLimit(ip);
    if (blocked) {
      logger.warn('IP rate limit exceeded', { ip });
      return res.status(429).json({
        success: false,
        error: 'Too many requests from this IP. Try again later.',
        retryAfter: 900,
      });
    }
    next();
  } catch (err) {
    logger.error('IP rate limit check failed. Using degraded mode.', { error: err.message });
    // Emergency IP in-memory fallback (60s sliding window)
    const ip = req.ip || req.socket.remoteAddress;
    if (ip) {
      const now = Date.now();
      if (!emergencyMemoryCache.has(ip)) {
        emergencyMemoryCache.set(ip, { count: 0, resetAt: now + 60000 });
      }
      const state = emergencyMemoryCache.get(ip);
      if (now > state.resetAt) {
        state.count = 0;
        state.resetAt = now + 60000;
      }
      state.count += 1;
      
      if (state.count > 50) { // strict emergency IP quota: 50 per 60s
        return res.status(429).json({ success: false, error: 'Emergency IP rate limit exceeded' });
      }
    }
    next();
  }
};

/**
 * Per-user weighted rate limiter (applied to /api/v1/* routes)
 * Must run AFTER apiKeyAuth (needs req.user and req.apiSlug)
 */
const userRateLimit = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const plan   = req.user?.plan || 'free';
    const slug   = req.apiSlug || 'unknown';
    const cost   = req.apiCost ?? 1;

    if (!userId) return next();

    const result = await RateLimitService.checkAndIncrement(userId, plan, cost);

    // Set rate limit headers
    res.set({
      'X-RateLimit-Limit':     result.limit,
      'X-RateLimit-Remaining': Math.max(0, result.remaining),
      'X-RateLimit-Used':      result.used,
      'X-RateLimit-Reset':     new Date(new Date().setUTCHours(24, 0, 0, 0)).toISOString(),
    });

    if (!result.allowed) {
      await UsageService.log({
        userId, apiKeyId: req.apiKey?.id, apiId: req.apiId,
        endpoint: req.originalUrl, method: req.method,
        status: 'rate_limited', statusCode: 429, costWeight: cost,
        ipAddress: req.ip, userAgent: req.get('user-agent'),
      });
      return res.status(429).json({
        success: false,
        error: 'Daily rate limit exceeded',
        limit: result.limit, used: result.used, remaining: 0,
        resetAt: new Date(new Date().setUTCHours(24, 0, 0, 0)).toISOString(),
      });
    }

    if (result.warning) {
      res.set('X-RateLimit-Warning', `You have used ${Math.round((result.used / result.limit) * 100)}% of your daily limit`);
    }

    // Attach cost to request for usage logging
    req.costWeight = cost;
    next();
  } catch (err) {
    logger.error('User rate limit error. Using emergency memory fallback.', { error: err.message });
    
    // Emergency in-memory fallback (30s sliding window)
    const userId = req.user?.id;
    if (userId) {
      const now = Date.now();
      if (!emergencyMemoryCache.has(userId)) {
        emergencyMemoryCache.set(userId, { count: 0, resetAt: now + 30000 });
      }
      const state = emergencyMemoryCache.get(userId);
      if (now > state.resetAt) {
        state.count = 0;
        state.resetAt = now + 30000;
      }
      const cost = req.apiCost ?? 1;
      state.count += cost;
      
      if (state.count > 10) { // strict emergency quota: 10 per 30s
        return res.status(429).json({ success: false, error: 'Emergency rate limit exceeded' });
      }
    }
    next();
  }
};

module.exports = { ipRateLimit, userRateLimit };
