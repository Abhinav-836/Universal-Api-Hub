// backend/src/services/apiKey.service.js
const ApiKeyModel = require('../models/apiKey.model');
const { generateApiKey, hashApiKey } = require('../utils/hash');
const { getRedis, KEYS, TTL } = require('../config/redis');
const { MAX_API_KEYS_PER_USER } = require('../utils/constants');
const logger = require('../utils/logger');

const ApiKeyService = {
  create: async ({ userId, label, keyType, scopedApis, expiresAt }) => {
    const count = await ApiKeyModel.countActiveByUser(userId);
    if (count >= MAX_API_KEYS_PER_USER) {
      const error = new Error(`Maximum of ${MAX_API_KEYS_PER_USER} API keys allowed per user`);
      error.statusCode = 409;
      throw error;
    }
    const { rawKey, keyHash, keyPrefix } = generateApiKey(userId);
    const keyRecord = await ApiKeyModel.create({
      userId, keyHash, keyPrefix,
      label: label || 'default',
      keyType: keyType || 'dev',
      scopedApis: scopedApis || null,
      expiresAt: expiresAt || null,
    });
    logger.info('API key created', { userId, keyPrefix, keyType });
    return { ...keyRecord, rawKey };
  },

  findByRawKey: async (rawKey) => {
    const keyHash = hashApiKey(rawKey);
    const redis = getRedis();
    const cacheKey = KEYS.apiKeyCache(keyHash);
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (_) { /* ignore */ }
    const keyRecord = await ApiKeyModel.findByHash(keyHash);
    if (!keyRecord) return null;
    try {
      await redis.set(cacheKey, JSON.stringify(keyRecord), 'EX', TTL.FIVE_MINUTES);
    } catch (_) { /* ignore */ }
    return keyRecord;
  },

  listForUser: async (userId) => {
    return ApiKeyModel.findByUserId(userId);
  },

  revoke: async (keyId, userId) => {
    const revoked = await ApiKeyModel.revoke(keyId, userId);
    if (!revoked) {
      const error = new Error('API key not found');
      error.statusCode = 404;
      throw error;
    }
    if (revoked.key_hash) {
      const redis = getRedis();
      await redis.del(KEYS.apiKeyCache(revoked.key_hash)).catch(() => {});
    }
    logger.info('API key revoked', { keyId, userId });
    return revoked;
  },

  updateScopes: async (keyId, userId, scopedApis) => {
    const updated = await ApiKeyModel.updateScopes(keyId, userId, scopedApis);
    if (!updated) {
      const error = new Error('API key not found');
      error.statusCode = 404;
      throw error;
    }
    if (updated.key_hash) {
      const redis = getRedis();
      await redis.del(KEYS.apiKeyCache(updated.key_hash)).catch(() => {});
    }
    return updated;
  },

  touchLastUsed: async (keyId) => ApiKeyModel.updateLastUsed(keyId),
};

module.exports = ApiKeyService;