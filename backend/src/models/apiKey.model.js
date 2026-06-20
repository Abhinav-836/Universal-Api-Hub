// backend/src/models/apiKey.model.js
const db = require('../config/db');

const ApiKeyModel = {
  /**
   * Find API key by its hash
   */
  findByHash: async (keyHash) => {
    const result = await db.query(
      `SELECT ak.*, u.plan, u.is_active as user_active
       FROM api_keys ak
       JOIN users u ON ak.user_id = u.id
       WHERE ak.key_hash = $1
         AND ak.is_active = TRUE
         AND (ak.expires_at IS NULL OR ak.expires_at > NOW())`,
      [keyHash]
    );
    return result.rows[0] || null;
  },

  /**
   * Find all API keys for a user
   */
  findByUserId: async (userId) => {
    const result = await db.query(
      `SELECT id, user_id, key_prefix, label, key_type, scoped_apis,
              expires_at, last_used_at, is_active, created_at
       FROM api_keys
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );
    return result.rows;
  },

  /**
   * Create a new API key
   */
  create: async ({ userId, keyHash, keyPrefix, label, keyType, scopedApis, expiresAt }) => {
    const result = await db.query(
      `INSERT INTO api_keys (user_id, key_hash, key_prefix, label, key_type, scoped_apis, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, key_prefix, label, key_type, scoped_apis, expires_at, created_at`,
      [userId, keyHash, keyPrefix, label, keyType, scopedApis || null, expiresAt || null]
    );
    return result.rows[0];
  },

  /**
   * Update last used timestamp
   */
  updateLastUsed: async (keyId) => {
    await db.query(
      'UPDATE api_keys SET last_used_at = NOW() WHERE id = $1',
      [keyId]
    );
  },

  /**
   * Revoke (soft-delete) an API key
   */
  revoke: async (keyId, userId) => {
    const result = await db.query(
      `UPDATE api_keys SET is_active = FALSE
       WHERE id = $1 AND user_id = $2
       RETURNING id, key_prefix, key_hash`,
      [keyId, userId]
    );
    return result.rows[0] || null;
  },

  /**
   * Count active keys for a user
   */
  countActiveByUser: async (userId) => {
    const result = await db.query(
      'SELECT COUNT(*) FROM api_keys WHERE user_id = $1 AND is_active = TRUE',
      [userId]
    );
    return parseInt(result.rows[0].count);
  },

  /**
   * Update scoped APIs for a key
   */
  updateScopes: async (keyId, userId, scopedApis) => {
    const result = await db.query(
      `UPDATE api_keys SET scoped_apis = $1
       WHERE id = $2 AND user_id = $3
       RETURNING id, key_prefix, key_hash, scoped_apis`,
      [scopedApis, keyId, userId]
    );
    return result.rows[0] || null;
  },
};

module.exports = ApiKeyModel;
