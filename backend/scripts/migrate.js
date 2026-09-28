#!/usr/bin/env node
require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// SSL helper — reads DB_SSL so the same script works against:
//   - Managed providers (Supabase, Render, etc.) that require SSL with
//     self-signed certs  → default { rejectUnauthorized: false }
//   - Local dev / CI containers (postgres:15-alpine on localhost) that
//     do NOT support SSL → set DB_SSL=false
// The DATABASE_URL branch previously hardcoded SSL, which broke the CI
// service container with "The server does not support SSL connections".
const parseSsl = () => {
  if (String(process.env.DB_SSL).toLowerCase() === 'false') return false;
  return { rejectUnauthorized: false };
};

const config = process.env.DATABASE_URL ? {
  connectionString: process.env.DATABASE_URL,
  ssl: parseSsl(),
} : {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'postgres',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  ssl: parseSsl(),
};

const MIGRATIONS_DIR = path.join(__dirname, '../../database/migrations');
const ADVISORY_LOCK_KEY = 987654321; // arbitrary but consistent

async function migrate() {
  console.log('🔍 Connecting to database...');
  const client = new Client(config);

  try {
    await client.connect();
    console.log('✅ Connected');
  } catch (err) {
    console.error('❌ Connection failed:', err.message);
    process.exit(1);
  }

  // Acquire advisory lock to prevent concurrent migrations
  try {
    await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_KEY]);
    console.log('🔒 Acquired advisory lock');
  } catch (err) {
    console.error('❌ Failed to acquire advisory lock:', err.message);
    await client.end();
    process.exit(1);
  }

  try {
    // Create migrations tracking table
    await client.query(`CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);

    if (!fs.existsSync(MIGRATIONS_DIR)) {
      console.log(`📁 Creating migrations directory: ${MIGRATIONS_DIR}`);
      fs.mkdirSync(MIGRATIONS_DIR, { recursive: true });
      console.log('⚠️ No migration files found. Please add SQL files to database/migrations/');
      return;
    }

    const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();

    if (files.length === 0) {
      console.log('⚠️ No migration files found in:', MIGRATIONS_DIR);
      return;
    }

    const applied = (await client.query('SELECT filename FROM _migrations')).rows.map(r => r.filename);

    let appliedCount = 0;

    for (const file of files) {
      if (applied.includes(file)) {
        console.log(`⏭ Skipping ${file} (already applied)`);
        continue;
      }

      console.log(`📝 Applying ${file}...`);
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');

      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`✅ Applied ${file}`);
        appliedCount++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`❌ Failed to apply ${file}:`, err.message);
        throw err;
      }
    }

    console.log(`🎉 Migrations finished successfully! (${appliedCount} applied)`);
  } finally {
    // Always release the lock
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]);
      console.log('🔓 Released advisory lock');
    } catch (_) { /* ignore */ }
    await client.end();
  }
}

migrate().catch(err => {
  console.error('❌ Migration error:', err.message);
  process.exit(1);
});