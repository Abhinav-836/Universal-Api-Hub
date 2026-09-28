-- Migration 003: Create APIs Table
-- Note: `plan_type` enum is created in 001_create_users.sql.
-- If running standalone, ensure 001 has run first.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'plan_type') THEN
        CREATE TYPE plan_type AS ENUM ('free', 'pro', 'premium');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS apis (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug            VARCHAR(100) UNIQUE NOT NULL,
    name            VARCHAR(200) NOT NULL,
    description     TEXT,
    endpoint        VARCHAR(255) NOT NULL,
    category        VARCHAR(50) NOT NULL DEFAULT 'utility',
    cost            INT NOT NULL DEFAULT 1,
    cost_weight     INT NOT NULL DEFAULT 1,
    min_plan        plan_type NOT NULL DEFAULT 'free',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_apis_slug ON apis(slug);
CREATE INDEX IF NOT EXISTS idx_apis_category ON apis(category);
CREATE INDEX IF NOT EXISTS idx_apis_min_plan ON apis(min_plan);