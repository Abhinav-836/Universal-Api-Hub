// backend/src/services/rateLimit.service.js
const { getRedis, KEYS } = require('../config/redis');
const { PLANS, RATE_LIMIT } = require('../utils/constants');
const logger = require('../utils/logger');

// ── Lua: atomic check-and-increment for user daily quota ──────────────────
// Returns: [allowed(0|1), newUsed, remaining]
const CHECK_AND_INCREMENT_LUA = `
local key   = KEYS[1]
local cost  = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local ttl   = tonumber(ARGV[3])
local current = tonumber(redis.call('GET', key) or 0)
if current + cost > limit then
  return {0, current, limit - current}
end
local newVal = redis.call('INCRBY', key, cost)
redis.call('EXPIRE', key, ttl)
return {1, newVal, limit - newVal}
`;

// ── Lua: atomic check-and-increment for IP abuse protection ──────────────
// Returns: 1 = blocked, 0 = allowed
const IP_RATE_LIMIT_LUA = `
local key   = KEYS[1]
local limit = tonumber(ARGV[1])
local ttl   = tonumber(ARGV[2])
local current = tonumber(redis.call('GET', key) or 0)
if current >= limit then
  return 1
end
redis.call('INCR', key)
redis.call('EXPIRE', key, ttl)
return 0
`;

/**
 * Get user's plan with caching
 */
async function getUserPlan(userId) {
  if (!userId) return 'free';
  
  const redis = getRedis();
  const cacheKey = `user:${userId}:plan`;
  
  try {
    const cached = await redis.get(cacheKey);
    if (cached) return cached;
  } catch (_) { /* ignore */ }
  
  try {
    const db = require('../config/db');
    const result = await db.query('SELECT plan FROM users WHERE id = $1', [userId]);
    const plan = result.rows[0]?.plan || 'free';
    await redis.set(cacheKey, plan, 'EX', 300);
    return plan;
  } catch (err) {
    logger.error('Failed to get user plan:', err.message);
    return 'free';
  }
}

const RateLimitService = {
  /**
   * Get seconds until midnight (UTC) — for daily reset TTL
   */
  secondsUntilMidnight: () => {
    const now = new Date();
    const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    return Math.ceil((midnight - now) / 1000);
  },

  /**
   * Check and increment daily usage.
   * Returns { allowed, used, limit, remaining, warning }
   */
  checkAndIncrement: async (userId, plan, costWeight = 1) => {
    const redis = getRedis();
    const key   = KEYS.userDailyUsage(userId);
    const limit = PLANS[plan]?.dailyLimit ?? 10;
    const ttl   = RateLimitService.secondsUntilMidnight();

    // Atomic Lua: no race between check and increment
    const [allowed, newUsed, remaining] = await redis.eval(
      CHECK_AND_INCREMENT_LUA,
      1,           // number of keys
      key,         // KEYS[1]
      costWeight,  // ARGV[1]
      limit,       // ARGV[2]
      ttl,         // ARGV[3]
    );

    if (!allowed) {
      logger.warn('Rate limit exceeded', { userId, used: newUsed, limit, costWeight });
      return { allowed: false, used: newUsed, limit, remaining, warning: false };
    }

    const warning = newUsed / limit >= RATE_LIMIT.WARNING_THRESHOLD;
    return { allowed: true, used: newUsed, limit, remaining, warning };
  },

  /**
   * Get current usage without incrementing
   */
  getUsage: async (userId, plan) => {
    const redis = getRedis();
    const key = KEYS.userDailyUsage(userId);
    const limit = PLANS[plan]?.dailyLimit ?? 10;
    const used = parseInt(await redis.get(key) || '0');
    const remaining = Math.max(0, limit - used);
    const warning = used / limit >= RATE_LIMIT.WARNING_THRESHOLD;
    return { used, limit, remaining, warning, percentUsed: Math.round((used / limit) * 100) };
  },

  /**
   * IP-based abuse protection
   * Returns true if request should be blocked
   */
  checkIpLimit: async (ip) => {
    const redis = getRedis();
    const key      = KEYS.ipRequests(ip);
    const maxReqs  = parseInt(process.env.IP_RATE_LIMIT_MAX || '200');
    const windowMs = parseInt(process.env.IP_RATE_LIMIT_WINDOW_MS || '900000');
    const ttl      = Math.ceil(windowMs / 1000);

    // Atomic Lua: no race between check and incr
    const blocked = await redis.eval(
      IP_RATE_LIMIT_LUA,
      1,       // number of keys
      key,     // KEYS[1]
      maxReqs, // ARGV[1]
      ttl,     // ARGV[2]
    );

    return blocked === 1;
  },

  /**
   * Reset a user's daily counter (admin use)
   */
  resetUserUsage: async (userId) => {
    const redis = getRedis();
    await redis.del(KEYS.userDailyUsage(userId));
  },

  /**
   * Get rate limit info for a user across all services
   */
  getRateLimitInfo: async (userId) => {
    const plan = await getUserPlan(userId);
    const planConfig = PLANS[plan] || PLANS.free;
    
    return {
      plan,
      daily: {
        limit: planConfig.dailyLimit || 10,
        used: await RateLimitService.getCurrentDailyUsage(userId),
      },
      alphaVantage: {
        limit: planConfig.alphaVantageCallsPerMin || 5,
      },
      yahooFinance: {
        limit: planConfig.yahooFinanceCallsPerMin || 10,
      },
    };
  },

  getCurrentDailyUsage: async (userId) => {
    const redis = getRedis();
    const key = KEYS.userDailyUsage(userId);
    try {
      const val = await redis.get(key);
      return parseInt(val) || 0;
    } catch (_) {
      return 0;
    }
  },
};

module.exports = RateLimitService;