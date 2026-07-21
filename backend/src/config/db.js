// backend/src/config/db.js
const { Pool } = require('pg');
const logger = require('../utils/logger');

// Use the working configuration from your test
const poolConfig = {
  host: 'aws-1-us-west-2.pooler.supabase.com',
  port: 6543,  // Transaction pooler port
  database: 'postgres',
  user: 'postgres.lpvxlwcvxnkbrkqetovu',
  password: process.env.DB_PASSWORD,
  ssl: {
    rejectUnauthorized: false,
  },
  max: parseInt(process.env.DB_POOL_MAX) || 10,
  idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT) || 30000,
  connectionTimeoutMillis: parseInt(process.env.DB_POOL_CONNECT_TIMEOUT) || 10000,
  keepAlive: true,  // Important: This helped the connection work
};

// Validate password is set
if (!poolConfig.password && process.env.NODE_ENV === 'production') {
  throw new Error('FATAL: DB_PASSWORD must be set in production');
}

const pool = new Pool(poolConfig);

pool.on('connect', () => logger.debug('New PostgreSQL client connected'));
pool.on('error', (err) => logger.error('Unexpected PostgreSQL pool error', { error: err.message }));

const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    logger.debug('Executed query', { text, duration, rows: result.rowCount });
    return result;
  } catch (err) {
    logger.error('Database query error', { text, error: err.message });
    throw err;
  }
};

const getClient = async () => {
  const client = await pool.connect();
  const originalQuery = client.query.bind(client);
  const release = client.release.bind(client);
  client.query = (...args) => {
    client.lastQuery = args;
    return originalQuery(...args);
  };
  client.release = () => {
    client.query = originalQuery;
    release();
  };
  return client;
};

const withTransaction = async (callback) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const testConnection = async () => {
  try {
    const result = await query('SELECT NOW()');
    logger.info('PostgreSQL connected', { time: result.rows[0].now });
    return true;
  } catch (err) {
    logger.error('PostgreSQL connection failed', { error: err.message });
    return false;
  }
};

module.exports = { query, getClient, withTransaction, testConnection, pool };