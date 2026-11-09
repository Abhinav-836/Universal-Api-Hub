-- Migration 009: Razorpay payments
-- Each payment buys 30 days of a plan. plan_expires_at is when that time
-- runs out; after it, the plan drops back to free. NULL = no expiry (free
-- plan, or a plan granted without payment).
-- (The server also applies this at startup, see db/ensureSchema.js, because
-- the host doesn't run migrations on deploy.)
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS payments (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    plan        VARCHAR(20)  NOT NULL,
    amount      INT          NOT NULL,            -- in paise
    currency    VARCHAR(3)   NOT NULL DEFAULT 'INR',
    provider    VARCHAR(20)  NOT NULL DEFAULT 'razorpay',
    order_id    VARCHAR(64)  NOT NULL UNIQUE,
    payment_id  VARCHAR(64)  UNIQUE,
    status      VARCHAR(20)  NOT NULL DEFAULT 'created',   -- created | paid | failed
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    paid_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
