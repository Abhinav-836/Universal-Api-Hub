// backend/src/models/user.model.js
const db = require('../config/db');

// Stored instead of an argon2 hash for accounts without a password. Never matches.
const NO_PASSWORD = '!google';

const UserModel = {
  NO_PASSWORD,

  /** For Google sign-in: includes disabled accounts, so they can be refused clearly. */
  findForGoogle: async ({ googleSub, email }) => {
    const bySub = await db.query(
      'SELECT id, email, username, plan, password_hash, google_sub, is_active FROM users WHERE google_sub = $1',
      [googleSub]
    );
    if (bySub.rows[0]) return bySub.rows[0];
    const byEmail = await db.query(
      'SELECT id, email, username, plan, password_hash, google_sub, is_active FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    return byEmail.rows[0] || null;
  },

  usernameTaken: async (username) => {
    const result = await db.query('SELECT 1 FROM users WHERE username = $1', [username.toLowerCase()]);
    return result.rows.length > 0;
  },

  createGoogle: async ({ email, username, googleSub }) => {
    const result = await db.query(
      `INSERT INTO users (email, username, password_hash, google_sub)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, username, plan, created_at`,
      [email.toLowerCase(), username.toLowerCase(), NO_PASSWORD, googleSub]
    );
    return result.rows[0];
  },

  /**
   * Link an existing account to Google. Emails were never verified on this
   * site, so a password already on the account may have been set by someone
   * who registered this address before its real owner: it stops working.
   */
  linkGoogle: async (userId, googleSub) => {
    await db.query(
      'UPDATE users SET google_sub = $1, password_hash = $2, updated_at = NOW() WHERE id = $3',
      [googleSub, NO_PASSWORD, userId]
    );
  },

  findByEmail: async (email) => {
    const result = await db.query(
      `SELECT id, email, username, plan, password_hash,
              api_switch_count, switch_reset_at, is_active, created_at
       FROM users WHERE email = $1 AND is_active = TRUE`,
      [email.toLowerCase()]
    );
    return result.rows[0] || null;
  },

  findById: async (id) => {
    const result = await db.query(
      `SELECT id, email, username, plan, plan_expires_at, api_switch_count, switch_reset_at,
              is_active, created_at
       FROM users WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  },

  findByIdWithPassword: async (id) => {
    const result = await db.query(
      'SELECT id, email, username, plan, password_hash, is_active FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  },

  findByUsername: async (username) => {
    const result = await db.query(
      'SELECT * FROM users WHERE username = $1 AND is_active = TRUE',
      [username.toLowerCase()]
    );
    return result.rows[0] || null;
  },

  create: async ({ email, username, passwordHash }) => {
    const result = await db.query(
      `INSERT INTO users (email, username, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, email, username, plan, created_at`,
      [email.toLowerCase(), username.toLowerCase(), passwordHash]
    );
    return result.rows[0];
  },

  /** expiresAt: when paid time on this plan ends (null = no end date). */
  updatePlan: async (userId, plan, expiresAt = null) => {
    const result = await db.query(
      `UPDATE users
       SET plan = $1, plan_expires_at = $3, updated_at = NOW()
       WHERE id = $2
       RETURNING id, email, username, plan, plan_expires_at, created_at`,
      [plan, userId, expiresAt]
    );
    return result.rows[0] || null;
  },

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

  existsByEmailOrUsername: async (email, username) => {
    const result = await db.query(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email.toLowerCase(), username.toLowerCase()]
    );
    return result.rows.length > 0;
  },

  updatePassword: async (userId, passwordHash) => {
    await db.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [passwordHash, userId]
    );
  }
};

module.exports = UserModel;