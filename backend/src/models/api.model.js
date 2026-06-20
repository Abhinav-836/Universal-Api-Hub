// backend/src/models/api.model.js
const db = require('../config/db');

const ApiModel = {
  /**
   * Get all active APIs
   */
  findAll: async () => {
    const result = await db.query(
      'SELECT * FROM apis WHERE is_active = TRUE ORDER BY category, min_plan, name'
    );
    return result.rows;
  },

  /**
   * Get API by slug
   */
  findBySlug: async (slug) => {
    const result = await db.query(
      'SELECT * FROM apis WHERE slug = $1 AND is_active = TRUE',
      [slug]
    );
    return result.rows[0] || null;
  },

  /**
   * Get APIs accessible by a given plan
   */
  findByPlan: async (plan) => {
    const planOrder = { free: 0, pro: 1, premium: 2 };
    const planLevel = planOrder[plan] ?? 0;
    // Return APIs whose min_plan level <= user's plan level
    const result = await db.query(
      `SELECT * FROM apis
       WHERE is_active = TRUE
         AND CASE min_plan
               WHEN 'free'    THEN 0
               WHEN 'pro'     THEN 1
               WHEN 'premium' THEN 2
             END <= $1
       ORDER BY name`,
      [planLevel]
    );
    return result.rows;
  },

  /**
   * Get APIs selected by a user
   */
  findUserApis: async (userId) => {
    const result = await db.query(
      `SELECT a.*
       FROM apis a
       JOIN user_api_access uaa ON a.id = uaa.api_id
       WHERE uaa.user_id = $1 AND a.is_active = TRUE
       ORDER BY a.category, a.name`,
      [userId]
    );
    return result.rows;
  },

  /**
   * Grant API access to a user
   */
  grantAccess: async (userId, apiId) => {
    const result = await db.query(
      `INSERT INTO user_api_access (user_id, api_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, api_id) DO NOTHING
       RETURNING id`,
      [userId, apiId]
    );
    return result.rows[0] || null;
  },

  /**
   * Revoke API access from a user
   */
  revokeAccess: async (userId, apiId) => {
    const result = await db.query(
      `DELETE FROM user_api_access
       WHERE user_id = $1 AND api_id = $2
       RETURNING id`,
      [userId, apiId]
    );
    return result.rows[0] || null;
  },

  /**
   * Count APIs a user has selected
   */
  countUserApis: async (userId) => {
    const result = await db.query(
      'SELECT COUNT(*) FROM user_api_access WHERE user_id = $1',
      [userId]
    );
    return parseInt(result.rows[0].count);
  },

  /**
   * Check if user has access to a specific API slug
   */
  userHasAccess: async (userId, slug) => {
    const result = await db.query(
      `SELECT 1 FROM user_api_access uaa
       JOIN apis a ON uaa.api_id = a.id
       WHERE uaa.user_id = $1 AND a.slug = $2`,
      [userId, slug]
    );
    return result.rows.length > 0;
  },

  /**
   * Get API by its ID
   */
  findById: async (id) => {
    const result = await db.query(
      'SELECT * FROM apis WHERE id = $1 AND is_active = TRUE',
      [id]
    );
    return result.rows[0] || null;
  },
};

module.exports = ApiModel;
