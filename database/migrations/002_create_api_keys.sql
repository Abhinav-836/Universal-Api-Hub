-- Migration 002: Create API Keys Table
DO $$
BEGIN
    CREATE TYPE key_type AS ENUM ('dev', 'prod', 'test');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS api_keys (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key_hash        TEXT NOT NULL UNIQUE,
    key_prefix      VARCHAR(12) NOT NULL,
    label           VARCHAR(100) NOT NULL DEFAULT 'default',
    key_type        key_type NOT NULL DEFAULT 'dev',
    scoped_apis     TEXT[],
    expires_at      TIMESTAMPTZ,
    last_used_at    TIMESTAMPTZ,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
