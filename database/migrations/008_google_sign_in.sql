-- Migration 008: Google sign-in
-- google_sub is Google's permanent ID for a person, set the first time they
-- use "Continue with Google". Accounts created with Google have no password:
-- their password_hash is '!google', which can never match.
-- (The server also applies this at startup, see UserModel.ensureGoogleColumn,
-- because the hosting doesn't run migrations on deploy.)
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub VARCHAR(255);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub);
