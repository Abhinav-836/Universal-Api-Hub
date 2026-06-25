#!/usr/bin/env node
require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// ✅ CORRECT PATH - Go up two levels to root, then database/migrations
// From: backend/scripts/migrate.js
// To:   database/migrations/
const MIGRATIONS_DIR = path.join(__dirname, '../../database/migrations');

// ✅ Use DATABASE_URL if available
const config = process.env.DATABASE_URL ? {
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
} : {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'universal_api_hub',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  ssl: false,
};

async function migrate() {
  const client = new Client(config);
  await client.connect();
  console.log('✅ Connected to PostgreSQL');

  await client.query(`CREATE TABLE IF NOT EXISTS _migrations (
    id SERIAL PRIMARY KEY,
    filename VARCHAR(255) UNIQUE NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);

  // ✅ Check if migrations directory exists
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.log(`❌ Migrations directory not found: ${MIGRATIONS_DIR}`);
    console.log('📁 Creating migrations directory...');
    fs.mkdirSync(MIGRATIONS_DIR, { recursive: true });
    console.log('✅ Created migrations directory');
    console.log('⚠️ No migration files found. Please add SQL files to database/migrations/');
    await client.end();
    return;
  }

  const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();

  if (files.length === 0) {
    console.log('⚠️ No migration files found in:', MIGRATIONS_DIR);
    await client.end();
    return;
  }

  const applied = (await client.query('SELECT filename FROM _migrations')).rows.map(r => r.filename);

  for (const file of files) {
    if (applied.includes(file)) {
      console.log(`⏭ Skipping ${file}`);
      continue;
    }
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    await client.query('BEGIN');
    await client.query("SELECT pg_try_advisory_xact_lock(123456)");
    await client.query(sql);
    await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
    await client.query('COMMIT');
    console.log(`✅ Applied ${file}`);
  }
  console.log('🎉 Migrations finished.');
  await client.end();
}

migrate().catch(err => {
  console.error('Migration error:', err.message);
  process.exit(1);
});