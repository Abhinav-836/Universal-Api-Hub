-- Migration 003: Create APIs Table
CREATE TABLE IF NOT EXISTS apis (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug            VARCHAR(100) UNIQUE NOT NULL,
    name            VARCHAR(200) NOT NULL,
    description     TEXT,
    endpoint        VARCHAR(255) NOT NULL,
    cost_weight     INT NOT NULL DEFAULT 1,
    min_plan        plan_type NOT NULL DEFAULT 'free',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
