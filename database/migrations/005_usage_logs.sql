-- Migration 005: Usage Logs
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'log_status') THEN
        CREATE TYPE log_status AS ENUM ('success', 'rate_limited', 'unauthorized', 'error');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS usage_logs (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id          UUID REFERENCES users(id) ON DELETE SET NULL,
    api_key_id       UUID REFERENCES api_keys(id) ON DELETE SET NULL,
    api_id           UUID REFERENCES apis(id) ON DELETE SET NULL,
    endpoint         VARCHAR(255) NOT NULL,
    method           VARCHAR(10) NOT NULL,
    status           log_status NOT NULL DEFAULT 'success',
    status_code      INT,
    cost_weight      INT NOT NULL DEFAULT 1,
    ip_address       INET,
    user_agent       TEXT,
    response_time_ms INT,
    error_message    TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_logs_user_id    ON usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_created_at ON usage_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_usage_logs_api_id     ON usage_logs(api_id);