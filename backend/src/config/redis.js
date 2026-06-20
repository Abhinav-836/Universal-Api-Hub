// backend/src/config/redis.js
const Redis = require('ioredis');
const logger = require('../utils/logger');

let redisClient = null;

const createRedisClient = () => {
  const options = {
    host:     process.env.REDIS_HOST || 'localhost',
    port:     parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => {
      if (times > 10) {
        logger.error('Redis retry limit exceeded');
        return null;
      }
      const delay = Math.min(times * 100, 3000);
      return delay;
    },
    reconnectOnError: (err) => {
      const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
      return targetErrors.some(e => err.message.includes(e));
    },
  };

  const client = new Redis(options);

  client.on('connect', () => logger.info('Redis connected'));
  client.on('ready', () => logger.info('Redis ready'));
  client.on('error', (err) => logger.error('Redis error', { error: err.message }));
  client.on('close', () => logger.warn('Redis connection closed'));
  client.on('reconnecting', (ms) => logger.info('Redis reconnecting', { delay: ms }));

  return client;
};

const getRedis = () => {
  if (!redisClient) {
    redisClient = createRedisClient();
  }
  return redisClient;
};

const testConnection = async () => {
  try {
    const client = getRedis();
    await client.ping();
    logger.info('Redis ping successful');
    return true;
  } catch (err) {
    logger.error('Redis connection failed', { error: err.message });
    return false;
  }
};

// Redis key helpers
const KEYS = {
  // Rate limiting: daily request counter per user
  userDailyUsage: (userId) => `rate:user:${userId}:daily`,

  // Rate limiting: IP abuse protection
  ipRequests: (ip) => `rate:ip:${ip}:requests`,

  // API switch count per user
  userSwitchCount: (userId) => `user:${userId}:switch_count`,

  // Cached user data
  userCache: (userId) => `cache:user:${userId}`,

  // Cached API key lookup
  apiKeyCache: (keyPrefix) => `cache:apikey:${keyPrefix}`,

  // Cached APIs list
  apisCache: () => 'cache:apis:all',

  // User's accessible APIs
  userApisCache: (userId) => `cache:user:${userId}:apis`,

  // External API caches
  newsCache: (key) => `cache:news:${key}`,
  sportsCache: (key) => `cache:sports:${key}`,

  webhookEvent: (eventId) => `webhook_event:${eventId}`,
};

const TTL = {
  ONE_MINUTE:  60,
  FIVE_MINUTES: 300,
  ONE_HOUR:    3600,
  ONE_DAY:     86400,
  ONE_WEEK:    604800,
};

module.exports = { getRedis, testConnection, KEYS, TTL };
