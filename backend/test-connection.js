require('dotenv').config();
const { Client } = require('pg');

console.log('Testing with:');
console.log('Host:', process.env.DB_HOST);
console.log('Port:', process.env.DB_PORT);
console.log('Database:', process.env.DB_NAME);
console.log('User:', process.env.DB_USER);
console.log('Password:', process.env.DB_PASSWORD ? '(set)' : 'missing');

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'universal_api_hub',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'Harsh@123',
  ssl: false,
};

const client = new Client(config);
client.connect()
  .then(() => {
    console.log('✅ Connection successful!');
    client.end();
  })
  .catch(err => {
    console.error('❌ Connection failed:', err.message);
  });