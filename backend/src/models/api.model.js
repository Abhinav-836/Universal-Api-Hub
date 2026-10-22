// backend/src/models/api.model.js
const db = require('../config/db');

const PLAN_LEVEL_SQL = `CASE a.min_plan
                          WHEN 'free'    THEN 0
                          WHEN 'pro'     THEN 1
                          WHEN 'premium' THEN 2
                        END`;

const PLAN_ORDER = { free: 0, pro: 1, premium: 2 };

const ApiModel = {
  findAll: async () => {
    const result = await db.query(
      'SELECT * FROM apis WHERE is_active = TRUE ORDER BY category, min_plan, name'
    );
    return result.rows;
  },

  findBySlug: async (slug) => {
    const result = await db.query(
      'SELECT * FROM apis WHERE slug = $1 AND is_active = TRUE',
      [slug]
    );
    return result.rows[0] || null;
  },

  findByPlan: async (plan) => {
    const planLevel = PLAN_ORDER[plan] ?? 0;
    const result = await db.query(
      `SELECT a.* FROM apis a
       WHERE a.is_active = TRUE
         AND ${PLAN_LEVEL_SQL} <= $1
       ORDER BY a.name`,
      [planLevel]
    );
    return result.rows;
  },

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

  revokeAccess: async (userId, apiId) => {
    const result = await db.query(
      `DELETE FROM user_api_access
       WHERE user_id = $1 AND api_id = $2
       RETURNING id`,
      [userId, apiId]
    );
    return result.rows[0] || null;
  },

  countUserApis: async (userId) => {
    const result = await db.query(
      'SELECT COUNT(*) FROM user_api_access WHERE user_id = $1',
      [userId]
    );
    return parseInt(result.rows[0].count);
  },

  userHasAccess: async (userId, slug) => {
    const result = await db.query(
      `SELECT 1 FROM user_api_access uaa
       JOIN apis a ON uaa.api_id = a.id
       WHERE uaa.user_id = $1 AND a.slug = $2`,
      [userId, slug]
    );
    return result.rows.length > 0;
  },

  userHasAccessById: async (userId, apiId) => {
    const result = await db.query(
      'SELECT 1 FROM user_api_access WHERE user_id = $1 AND api_id = $2',
      [userId, apiId]
    );
    return result.rows.length > 0;
  },

  findById: async (id) => {
    const result = await db.query(
      'SELECT * FROM apis WHERE id = $1 AND is_active = TRUE',
      [id]
    );
    return result.rows[0] || null;
  },

  /**
   * Bring a user's API grants in line with their plan.
   *  - premium: grant every active API.
   *  - free/pro: remove APIs above the plan's tier, then trim to maxSlots
   *    (keeping the oldest grants).
   * Called on every plan change (manual or Stripe webhook) so downgrades
   * can never keep paid-tier access.
   */
  syncAccessForPlan: async (userId, plan, maxSlots) => {
    return db.withTransaction(async (client) => {
      if (plan === 'premium') {
        await client.query(
          `INSERT INTO user_api_access (user_id, api_id)
           SELECT $1, id FROM apis WHERE is_active = TRUE
           ON CONFLICT (user_id, api_id) DO NOTHING`,
          [userId]
        );
        return;
      }

      const level = PLAN_ORDER[plan] ?? 0;
      await client.query(
        `DELETE FROM user_api_access uaa
         USING apis a
         WHERE uaa.api_id = a.id
           AND uaa.user_id = $1
           AND ${PLAN_LEVEL_SQL} > $2`,
        [userId, level]
      );

      if (Number.isFinite(maxSlots)) {
        await client.query(
          `DELETE FROM user_api_access
           WHERE id IN (
             SELECT id FROM user_api_access
             WHERE user_id = $1
             ORDER BY granted_at ASC, id ASC
             OFFSET $2
           )`,
          [userId, maxSlots]
        );
      }
    });
  },
};

module.exports = ApiModel;