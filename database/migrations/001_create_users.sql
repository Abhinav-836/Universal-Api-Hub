-- Migration 001: Create Users Table
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
DO $$
BEGIN
    CREATE TYPE plan_type AS ENUM ('free', 'pro', 'premium');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           VARCHAR(255) UNIQUE NOT NULL,
    username        VARCHAR(100) UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    plan            plan_type NOT NULL DEFAULT 'free',
    api_switch_count INT NOT NULL DEFAULT 0,
    switch_reset_at  DATE NOT NULL DEFAULT CURRENT_DATE,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_plan ON users(plan);
