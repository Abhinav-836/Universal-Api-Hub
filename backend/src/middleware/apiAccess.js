// backend/src/middleware/apiAccess.js
const ApiModel = require('../models/api.model');
const { getRedis, KEYS, TTL } = require('../config/redis');
const logger = require('../utils/logger');

const apiAccessCheck = (slug) => async (req, res, next) => {
  try {
    req.apiSlug = slug;

    const userId = req.user?.id;
    const plan   = req.user?.plan;

    const api = await ApiModel.findBySlug(slug);
    if (!api) {
      return res.status(404).json({ success: false, error: 'API not found' });
    }

    req.apiId     = api.id;
    req.apiRecord = api;
    // FIX: prefer cost_weight column, fall back to 1
    req.apiCost   = api.cost_weight ?? api.cost ?? 1;

    if (req.apiKey?.scoped_apis?.length) {
      if (!req.apiKey.scoped_apis.includes(slug)) {
        return res.status(403).json({
          success: false,
          error: `This API key is not scoped for "${api.name}"`,
        });
      }
    }

    if (plan === 'premium') return next();

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