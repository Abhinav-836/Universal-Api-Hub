#!/usr/bin/env node
require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Supabase connection configuration
const config = process.env.DATABASE_URL ? {
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
} : {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'postgres',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  ssl: { rejectUnauthorized: false },
};

// Path to migrations directory
const MIGRATIONS_DIR = path.join(__dirname, '../../database/migrations');

async function migrate() {
  console.log('🔍 Connecting to Supabase...');
  const client = new Client(config);
  
  try {
    await client.connect();
    console.log('✅ Connected to Supabase');
  } catch (err) {
    console.error('❌ Connection failed:', err.message);
    console.error('📌 Please check your DATABASE_URL or DB_* environment variables');
    process.exit(1);
  }

  // Create migrations table if it doesn't exist
  await client.query(`CREATE TABLE IF NOT EXISTS _migrations (
    id SERIAL PRIMARY KEY,
    filename VARCHAR(255) UNIQUE NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);

  // Check if migrations directory exists
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

  // Get already applied migrations
  const applied = (await client.query('SELECT filename FROM _migrations')).rows.map(r => r.filename);

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
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`❌ Failed to apply ${file}:`, err.message);
      await client.end();
      process.exit(1);
    }
  }

  console.log('🎉 Migrations finished successfully!');
  await client.end();
}

migrate().catch(err => {
  console.error('Migration error:', err.message);
  process.exit(1);
});