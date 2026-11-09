// backend/src/services/plan.service.js
// The one place a user's plan changes, so every path (manual switch, payment,
// expiry) also re-syncs API access and clears cached copies of the user.
const UserModel = require('../models/user.model');
const ApiModel = require('../models/api.model');
const ApiKeyService = require('./apiKey.service');
const { getRedis, KEYS } = require('../config/redis');
const { PLANS } = require('../utils/constants');

const invalidateUserCaches = async (userId) => {
  const redis = getRedis();
  await Promise.allSettled([
    redis.del(KEYS.userCache(userId)),
    redis.del(`user:${userId}:plan`),
    redis.del(KEYS.userApisCache(userId)),
    ApiKeyService.invalidateUserKeys(userId),
  ]);
};

/** Set the plan (and when it ends: null = no end), then re-sync API access. */
const applyPlanChange = async (userId, plan, expiresAt = null) => {
  const updatedUser = await UserModel.updatePlan(userId, plan, expiresAt);
  await ApiModel.syncAccessForPlan(userId, plan, PLANS[plan]?.apiSlots);
  await invalidateUserCaches(userId);
  return updatedUser;
};

module.exports = { applyPlanChange, invalidateUserCaches };
