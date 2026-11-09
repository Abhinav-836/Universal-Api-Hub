// backend/src/db/ensureSchema.js
//
// The host (Render) doesn't run database/migrations on deploy, so the
// columns and tables newer features need are added here at startup. Every
// statement is idempotent (IF NOT EXISTS) and mirrors a migration file:
//   008_google_sign_in.sql, 009_razorpay_billing.sql, 010_wallet.sql
const db = require('../config/db');

const STATEMENTS = [
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub VARCHAR(255)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub)',
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ',
  `CREATE TABLE IF NOT EXISTS payments (
     id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
     plan        VARCHAR(20)  NOT NULL,
     amount      INT          NOT NULL,
     currency    VARCHAR(3)   NOT NULL DEFAULT 'INR',
     provider    VARCHAR(20)  NOT NULL DEFAULT 'razorpay',
     order_id    VARCHAR(64)  NOT NULL UNIQUE,
     payment_id  VARCHAR(64)  UNIQUE,
     status      VARCHAR(20)  NOT NULL DEFAULT 'created',
     created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
     paid_at     TIMESTAMPTZ
   )`,
  'CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id)',
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS credit_paise BIGINT NOT NULL DEFAULT 0',
  `CREATE TABLE IF NOT EXISTS wallet_transactions (
     id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     amount_paise   BIGINT       NOT NULL,
     kind           VARCHAR(20)  NOT NULL,
     ref            VARCHAR(255),
     model          VARCHAR(120),
     cost_usd       NUMERIC(14, 8),
     balance_after  BIGINT       NOT NULL,
     created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
   )`,
  'CREATE INDEX IF NOT EXISTS idx_wallet_tx_user ON wallet_transactions(user_id, created_at DESC)',
];

async function ensureSchema() {
  for (const sql of STATEMENTS) {
    await db.query(sql);
  }
}

module.exports = { ensureSchema };
