#!/usr/bin/env node
require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// ✅ Use DATABASE_URL if available, otherwise fallback to individual variables
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

async function seed() {
  const client = new Client(config);
  await client.connect();
  console.log('✅ Connected to PostgreSQL');

  // ✅ Correct path: from scripts/ up to root, then database/seed.sql
  const seedPath = path.join(__dirname, '../database/seed.sql');
  
  if (!fs.existsSync(seedPath)) {
    console.log(`❌ Seed file not found: ${seedPath}`);
    console.log('📁 Looking for seed.sql in:', path.join(__dirname, '../database/'));
    await client.end();
    return;
  }

  const sql = fs.readFileSync(seedPath, 'utf8');
  await client.query(sql);
  console.log('🌱 Seed data inserted.');
  await client.end();
}

seed().catch(err => {
  console.error('Seed error:', err.message);
  process.exit(1);
});