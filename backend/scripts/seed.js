#!/usr/bin/env node
require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const config = process.env.DATABASE_URL ? {
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
} : {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'postgres',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
};

async function seed() {
  console.log('🔍 Connecting to database...');
  const client = new Client(config);

  try {
    await client.connect();
    console.log('✅ Connected');
  } catch (err) {
    console.error('❌ Connection failed:', err.message);
    process.exit(1);
  }

  const seedPath = path.join(__dirname, '../../database/seed.sql');

  if (!fs.existsSync(seedPath)) {
    console.log(`❌ Seed file not found: ${seedPath}`);
    await client.end();
    process.exit(1);
  }

  console.log('📝 Seeding data...');
  const sql = fs.readFileSync(seedPath, 'utf8');

  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('🌱 Seed data inserted successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seed error:', err.message);
    await client.end();
    process.exit(1);
  }

  await client.end();
}

seed().catch(err => {
  console.error('❌ Seed error:', err.message);
  process.exit(1);
});