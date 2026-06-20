-- Universal API Hub - Complete Database Schema
-- PostgreSQL

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUM TYPES
-- ============================================================
CREATE TYPE plan_type AS ENUM ('free', 'pro', 'premium');
CREATE TYPE key_type AS ENUM ('dev', 'prod', 'test');
CREATE TYPE log_status AS ENUM ('success', 'rate_limited', 'unauthorized', 'error');

-- ============================================================
-- USERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           VARCHAR(255) UNIQUE NOT NULL,
    username        VARCHAR(100) UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    plan            plan_type NOT NULL DEFAULT 'free',
    api_switch_count INT NOT NULL DEFAULT 0,
    switch_reset_at  DATE NOT NULL DEFAULT CURRENT_DATE,
    stripe_customer_id VARCHAR(255),
    stripe_subscription_id VARCHAR(255),
    stripe_price_id VARCHAR(255),
    billing_status  VARCHAR(50),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_plan ON users(plan);

-- ============================================================
-- API_KEYS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS api_keys (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key_hash        TEXT NOT NULL UNIQUE,
    key_prefix      VARCHAR(12) NOT NULL,  -- First 12 chars for identification
    label           VARCHAR(100) NOT NULL DEFAULT 'default',
    key_type        key_type NOT NULL DEFAULT 'dev',
    scoped_apis     TEXT[],               -- NULL = access to all allowed APIs
    expires_at      TIMESTAMPTZ,
    last_used_at    TIMESTAMPTZ,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_prefix ON api_keys(key_prefix);

-- ============================================================
-- APIS TABLE (Available APIs in the system)
-- ============================================================
CREATE TABLE IF NOT EXISTS apis (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug            VARCHAR(100) UNIQUE NOT NULL,  -- e.g. 'chat', 'weather'
    name            VARCHAR(200) NOT NULL,
    description     TEXT,
    endpoint        VARCHAR(255) NOT NULL,
    category        VARCHAR(50) NOT NULL DEFAULT 'utility',
    cost            INT NOT NULL DEFAULT 1,
    cost_weight     INT NOT NULL DEFAULT 1,        -- Rate limit cost
    min_plan        plan_type NOT NULL DEFAULT 'free',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_apis_slug ON apis(slug);
CREATE INDEX idx_apis_category ON apis(category);
CREATE INDEX idx_apis_min_plan ON apis(min_plan);

-- ============================================================
-- USER_API_ACCESS TABLE (User-selected API access)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_api_access (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    api_id          UUID NOT NULL REFERENCES apis(id) ON DELETE CASCADE,
    granted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, api_id)
);

CREATE INDEX idx_user_api_access_user ON user_api_access(user_id);
CREATE INDEX idx_user_api_access_api ON user_api_access(api_id);

-- ============================================================
-- USAGE_LOGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS usage_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    api_key_id      UUID REFERENCES api_keys(id) ON DELETE SET NULL,
    api_id          UUID REFERENCES apis(id) ON DELETE SET NULL,
    endpoint        VARCHAR(255) NOT NULL,
    method          VARCHAR(10) NOT NULL,
    status          log_status NOT NULL DEFAULT 'success',
    status_code     INT,
    cost_weight     INT NOT NULL DEFAULT 1,
    ip_address      INET,
    user_agent      TEXT,
    response_time_ms INT,
    error_message   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_usage_logs_user_id ON usage_logs(user_id);
CREATE INDEX idx_usage_logs_created_at ON usage_logs(created_at);
CREATE INDEX idx_usage_logs_api_id ON usage_logs(api_id);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
