-- Migration 004: User API Access
CREATE TABLE IF NOT EXISTS user_api_access (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    api_id     UUID NOT NULL REFERENCES apis(id) ON DELETE CASCADE,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, api_id)
);
CREATE INDEX idx_user_api_access_user ON user_api_access(user_id);
