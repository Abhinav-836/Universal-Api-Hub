// backend/src/models/user.model.js
const db = require('../config/db');

const UserModel = {
  /**
   * Find user by email
   */
  findByEmail: async (email) => {
    const result = await db.query(
      `SELECT id, email, username, plan, password_hash,
              api_switch_count, switch_reset_at, is_active, created_at
       FROM users WHERE email = $1 AND is_active = TRUE`,
      [email.toLowerCase()]
    );
    return result.rows[0] || null;
  },

  /**
   * Find user by ID
   */
  findById: async (id) => {
    const result = await db.query(
      `SELECT id, email, username, plan, api_switch_count, switch_reset_at, 
              is_active, created_at, stripe_customer_id, stripe_subscription_id, 
              stripe_price_id, billing_status 
       FROM users WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  },

  /**
   * Find user by username
   */
  findByUsername: async (username) => {
    const result = await db.query(
      'SELECT * FROM users WHERE username = $1 AND is_active = TRUE',
      [username.toLowerCase()]
    );
    return result.rows[0] || null;
  },

  /**
   * Create a new user
   */
  create: async ({ email, username, passwordHash }) => {
    const result = await db.query(
      `INSERT INTO users (email, username, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, email, username, plan, created_at`,
      [email.toLowerCase(), username.toLowerCase(), passwordHash]
    );
    return result.rows[0];
  },

  /**
   * Update user plan
   */
  updatePlan: async (userId, plan) => {
    const result = await db.query(
      `UPDATE users 
       SET plan = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, email, username, plan, created_at`,
      [plan, userId]
    );
    return result.rows[0] || null;
  },

  /**
   * Increment API switch count (and reset daily if needed)
   */
  incrementSwitchCount: async (userId) => {
    const result = await db.query(
      `UPDATE users
       SET api_switch_count = CASE
         WHEN switch_reset_at < CURRENT_DATE THEN 1
         ELSE api_switch_count + 1
       END,
       switch_reset_at = CURRENT_DATE,
       updated_at = NOW()
       WHERE id = $1
       RETURNING api_switch_count, switch_reset_at`,
      [userId]
    );
    return result.rows[0];
  },

  /**
   * Check if user exists by email or username
   */
  existsByEmailOrUsername: async (email, username) => {
    const result = await db.query(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email.toLowerCase(), username.toLowerCase()]
    );
    return result.rows.length > 0;
  },

  /**
   * Update Stripe customer ID
   */
  updateStripeCustomer: async (userId, stripeCustomerId) => {
    await db.query(
      'UPDATE users SET stripe_customer_id = $1, updated_at = NOW() WHERE id = $2',
      [stripeCustomerId, userId]
    );
  },

  /**
   * Update Stripe subscription ID and billing status
   */
  updateStripeSubscription: async (userId, subscriptionId, status, priceId) => {
    await db.query(
      `UPDATE users 
       SET stripe_subscription_id = $1, 
           billing_status = $2, 
           stripe_price_id = $3, 
           updated_at = NOW() 
       WHERE id = $4`,
      [subscriptionId, status, priceId, userId]
    );
  }
};

module.exports = UserModel;