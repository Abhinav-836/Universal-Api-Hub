#!/usr/bin/env node
require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const config = {
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

  const sql = fs.readFileSync(path.join(__dirname, '../../database/seed.sql'), 'utf8');
  await client.query(sql);
  console.log('🌱 Seed data inserted.');
  await client.end();
}

seed().catch(err => {
  console.error('Seed error:', err.message);
  process.exit(1);
});