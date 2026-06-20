// backend/src/services/usage.service.js
const db = require('../config/db');
const logger = require('../utils/logger');

const UsageService = {
  /**
   * Log an API request
   */
  log: async ({ userId, apiKeyId, apiId, endpoint, method, status, statusCode, costWeight, ipAddress, userAgent, responseTimeMs, errorMessage }) => {
    try {
      await db.query(
        `INSERT INTO usage_logs
          (user_id, api_key_id, api_id, endpoint, method, status, status_code,
           cost_weight, ip_address, user_agent, response_time_ms, error_message)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [userId, apiKeyId, apiId, endpoint, method, status, statusCode,
         costWeight, ipAddress, userAgent, responseTimeMs, errorMessage || null]
      );
    } catch (err) {
      logger.error('Failed to write usage log', { error: err.message });
    }
  },

  /**
   * Get usage stats for a user (last 30 days)
   */
  getUserStats: async (userId) => {
    const result = await db.query(
      `SELECT
         DATE(created_at) as date,
         COUNT(*) as total_requests,
         SUM(cost_weight) as total_cost,
         COUNT(*) FILTER (WHERE status = 'success') as successful,
         COUNT(*) FILTER (WHERE status = 'rate_limited') as rate_limited,
         COUNT(*) FILTER (WHERE status = 'error') as errors
       FROM usage_logs
       WHERE user_id = $1
         AND created_at >= NOW() - INTERVAL '30 days'
       GROUP BY DATE(created_at)
       ORDER BY date DESC`,
      [userId]
    );
    return result.rows;
  },

  /**
   * Get per-API breakdown for a user
   */
  getApiBreakdown: async (userId) => {
    const result = await db.query(
      `SELECT
         a.slug,
         a.name,
         COUNT(ul.id) as request_count,
         SUM(ul.cost_weight) as total_cost,
         AVG(ul.response_time_ms)::INT as avg_response_ms
       FROM usage_logs ul
       JOIN apis a ON ul.api_id = a.id
       WHERE ul.user_id = $1
         AND ul.created_at >= NOW() - INTERVAL '30 days'
       GROUP BY a.id, a.slug, a.name
       ORDER BY request_count DESC`,
      [userId]
    );
    return result.rows;
  },

  /**
   * Get recent requests for a user
   */
  getRecent: async (userId, limit = 20) => {
    const result = await db.query(
      `SELECT ul.endpoint, ul.method, ul.status, ul.status_code,
              ul.cost_weight, ul.response_time_ms, ul.created_at, a.name as api_name
       FROM usage_logs ul
       LEFT JOIN apis a ON ul.api_id = a.id
       WHERE ul.user_id = $1
       ORDER BY ul.created_at DESC
       LIMIT $2`,
      [userId, limit]
    );
    return result.rows;
  },

  /**
   * Get today's total cost for a user
   */
  getTodayCost: async (userId) => {
    const result = await db.query(
      `SELECT COALESCE(SUM(cost_weight), 0) as total_cost, COUNT(*) as request_count
       FROM usage_logs
       WHERE user_id = $1 AND DATE(created_at) = CURRENT_DATE AND status = 'success'`,
      [userId]
    );
    return result.rows[0];
  },
};

module.exports = UsageService;
