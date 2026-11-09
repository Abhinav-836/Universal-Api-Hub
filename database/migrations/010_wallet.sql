-- Migration 010: prepaid AI credits ("wallet")
-- credit_paise: the user's balance in paise. Top-ups add to it; each paid AI
-- call takes what it cost. wallet_transactions records every change.
-- (Also applied at startup by db/ensureSchema.js.)
ALTER TABLE users ADD COLUMN IF NOT EXISTS credit_paise BIGINT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS wallet_transactions (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount_paise   BIGINT       NOT NULL,          -- + top-up/refund, − usage
    kind           VARCHAR(20)  NOT NULL,          -- topup | ai_usage | refund | adjust
    ref            VARCHAR(255),                   -- order id, or the endpoint for usage
    model          VARCHAR(120),
    cost_usd       NUMERIC(14, 8),                 -- what OpenRouter charged us
    balance_after  BIGINT       NOT NULL,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_user ON wallet_transactions(user_id, created_at DESC);
