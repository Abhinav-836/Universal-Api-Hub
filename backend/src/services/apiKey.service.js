// backend/src/services/apiKey.service.js
const ApiKeyModel = require('../models/apiKey.model');
const { generateApiKey, hashApiKey } = require('../utils/hash');
const { getRedis, KEYS, TTL } = require('../config/redis');
const { MAX_API_KEYS_PER_USER } = require('../utils/constants');
const logger = require('../utils/logger');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ApiKeyService = {
  create: async ({ userId, label, keyType, scopedApis, expiresAt }) => {
    const count = await ApiKeyModel.countActiveByUser(userId);
    if (count >= MAX_API_KEYS_PER_USER) {
      const error = new Error(`Maximum of ${MAX_API_KEYS_PER_USER} API keys allowed per user`);
      error.statusCode = 409;
      throw error;
    }
    if (expiresAt && new Date(expiresAt) <= new Date()) {
      const error = new Error('Expiry date must be in the future');
      error.statusCode = 400;
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
      if (cached) {
        const rec = JSON.parse(cached);
        // Cached record may have expired since it was cached
        if (!rec.expires_at || new Date(rec.expires_at) > new Date()) return rec;
      }
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
    if (!UUID_RE.test(String(keyId))) {
      const error = new Error('API key not found');
      error.statusCode = 404;
      throw error;
    }
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
    if (!UUID_RE.test(String(keyId))) {
      const error = new Error('API key not found');
      error.statusCode = 404;
      throw error;
    }
    const normalized = Array.isArray(scopedApis) && scopedApis.length ? scopedApis : null;
    const updated = await ApiKeyModel.updateScopes(keyId, userId, normalized);
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

  /**
   * Drop every cached key record for a user. The cached record embeds the
   * user's plan and active flag, so this must run on plan/status changes.
   */
  invalidateUserKeys: async (userId) => {
    try {
      const hashes = await ApiKeyModel.findHashesByUserId(userId);
      if (!hashes.length) return;
      const redis = getRedis();
      await redis.del(...hashes.map((h) => KEYS.apiKeyCache(h)));
    } catch (err) {
      logger.warn('Failed to invalidate API key cache', { userId, error: err.message });
    }
  },

  touchLastUsed: async (keyId) => ApiKeyModel.updateLastUsed(keyId),
};

module.exports = ApiKeyService;