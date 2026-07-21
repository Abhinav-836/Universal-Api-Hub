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

async function seed() {
  console.log('🔍 Connecting to Supabase...');
  const client = new Client(config);
  
  try {
    await client.connect();
    console.log('✅ Connected to Supabase');
  } catch (err) {
    console.error('❌ Connection failed:', err.message);
    process.exit(1);
  }

  const seedPath = path.join(__dirname, '../../database/seed.sql');

  if (!fs.existsSync(seedPath)) {
    console.log(`❌ Seed file not found: ${seedPath}`);
    await client.end();
    return;
  }

  console.log('📝 Seeding data...');
  const sql = fs.readFileSync(seedPath, 'utf8');
  
  try {
    await client.query(sql);
    console.log('🌱 Seed data inserted successfully!');
  } catch (err) {
    console.error('❌ Seed error:', err.message);
  }

  await client.end();
}

seed().catch(err => {
  console.error('Seed error:', err.message);
  process.exit(1);
});