#!/usr/bin/env node
require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, '../database/migrations');

const config = {
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

  const applied = (await client.query('SELECT filename FROM _migrations')).rows.map(r => r.filename);
  const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();

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
