// backend/test-connection.js
const { Client } = require('pg');

// Override the type parsing to preserve username
const types = require('pg').types;

const config = {
  host: 'aws-1-us-west-2.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.lpvxlwcvxnkbrkqetovu',
  password: 'universal-api-db',
  ssl: { rejectUnauthorized: false },
  // Keep the connection alive
  keepAlive: true,
};

console.log('🔍 Testing with keepAlive...');

const client = new Client(config);

async function test() {
  try {
    await client.connect();
    console.log('✅ Connected!');
    const result = await client.query('SELECT NOW() as time');
    console.log('🕐 Time:', result.rows[0].time);
    await client.end();
    console.log('🎉 Success!');
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

test();