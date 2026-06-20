// backend/src/middleware/apiAccess.js
const ApiModel = require('../models/api.model');
const { getRedis, KEYS, TTL } = require('../config/redis');
const logger = require('../utils/logger');

/**
 * Check if the user has selected access to the requested API.
 * Premium users bypass the check (auto-access to all APIs).
 * Attaches req.apiSlug, req.apiId, req.apiRecord to request.
 */
const apiAccessCheck = (slug) => async (req, res, next) => {
  try {
    req.apiSlug = slug;

    const userId = req.user?.id;
    const plan   = req.user?.plan;

    // Fetch the API record
    const api = await ApiModel.findBySlug(slug);
    if (!api) {
      return res.status(404).json({ success: false, error: 'API not found' });
    }

    req.apiId     = api.id;
    req.apiRecord = api;
    req.apiCost   = api.cost ?? api.cost_weight ?? req.apiCost ?? 1;

    // Check API key scope (if key has restricted scope)
    if (req.apiKey?.scoped_apis?.length) {
      if (!req.apiKey.scoped_apis.includes(slug)) {
        return res.status(403).json({
          success: false,
          error: `This API key is not scoped for "${api.name}"`,
        });
      }
    }

    // Premium users get all APIs automatically
    if (plan === 'premium') return next();

    // Check user has explicitly selected this API
    const redis   = getRedis();
    const cacheKey = KEYS.userApisCache(userId);

    let userApiSlugs;
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        userApiSlugs = JSON.parse(cached);
      }
    } catch (_) { /* ignore */ }

    if (!userApiSlugs) {
      const userApis  = await ApiModel.findUserApis(userId);
      userApiSlugs = userApis.map(a => a.slug);
      try {
        await redis.set(cacheKey, JSON.stringify(userApiSlugs), 'EX', TTL.FIVE_MINUTES);
      } catch (_) { /* ignore */ }
    }

    if (!userApiSlugs.includes(slug)) {
      return res.status(403).json({
        success: false,
        error: `You do not have access to the "${api.name}" API.`,
        hint: 'Select this API from your dashboard or upgrade your plan.',
      });
    }

    next();
  } catch (err) {
    logger.error('API access check error', { error: err.message });
    return res.status(500).json({ success: false, error: 'Access check failed' });
  }
};

module.exports = { apiAccessCheck };
