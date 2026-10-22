// backend/src/middleware/apiAccess.js
const ApiModel = require('../models/api.model');
const { getRedis, KEYS, TTL } = require('../config/redis');
const logger = require('../utils/logger');

const PLAN_ORDER = { free: 0, pro: 1, premium: 2 };

const apiAccessCheck = (slug) => async (req, res, next) => {
  try {
    req.apiSlug = slug;

    const userId = req.user?.id;
    const plan   = req.user?.plan || 'free';

    const api = await ApiModel.findBySlug(slug);
    if (!api) {
      return res.status(404).json({ success: false, error: 'API not found' });
    }

    req.apiId     = api.id;
    req.apiRecord = api;
    req.apiCost   = api.cost_weight ?? api.cost ?? 1;

    // Key scoping. Accept both slugs (documented format) and API ids
    // (what older versions of the dashboard stored) so existing keys work.
    const scoped = req.apiKey?.scoped_apis;
    if (Array.isArray(scoped) && scoped.length) {
      if (!scoped.includes(slug) && !scoped.includes(api.id)) {
        return res.status(403).json({
          success: false,
          error: `This API key is not scoped for "${api.name}"`,
        });
      }
    }

    // Always enforce the API's minimum tier against the CURRENT plan, so a
    // stale grant left over from a higher plan can never be used.
    if ((PLAN_ORDER[api.min_plan] ?? 0) > (PLAN_ORDER[plan] ?? 0)) {
      return res.status(403).json({
        success: false,
        error: `The "${api.name}" API requires the ${api.min_plan} plan.`,
        upgradeRequired: true,
      });
    }

    if (plan === 'premium') return next();

    const redis    = getRedis();
    const cacheKey = KEYS.userApisCache(userId);

    let userApiSlugs;
    try {
      const cached = await redis.get(cacheKey);
      if (cached) userApiSlugs = JSON.parse(cached);
    } catch (_) { /* ignore */ }

    if (!userApiSlugs) {
      const userApis = await ApiModel.findUserApis(userId);
      userApiSlugs = userApis.map((a) => a.slug);
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