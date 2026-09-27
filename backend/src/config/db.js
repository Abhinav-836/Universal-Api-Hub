// backend/src/config/db.js
const { Pool } = require('pg');
const logger = require('../utils/logger');

// ── BUG FIX ────────────────────────────────────────────────────────────────
// Previously this file ignored DATABASE_URL / DB_HOST / DB_USER / DB_PASSWORD
// entirely and hardcoded a specific Supabase project's host + username.
// That meant:
//   1. Changing DATABASE_URL (or any DB_* var) in .env had zero effect.
//   2. The app could never be pointed at a different database/environment
//      (staging, another developer's Supabase project, CI, etc.) without
//      editing this file's source code.
//   3. A live project reference was baked into source control.
// Fixed to build the pool config from environment variables, preferring a
// full DATABASE_URL connection string (the standard convention, and what
// env.js already validates as required) and falling back to discrete
// DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD vars for local dev.
const parseSslOption = () => {
  // DB_SSL=false disables SSL (e.g. local Postgres). Default: on, with
  // rejectUnauthorized disabled since most managed providers (Supabase,
  // Render, etc.) use certs that aren't in Node's default CA bundle.
  if (String(process.env.DB_SSL).toLowerCase() === 'false') return false;
  return { rejectUnauthorized: false };
};

const buildPoolConfig = () => {
  const common = {
    max: parseInt(process.env.DB_POOL_MAX) || 10,
    idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT) || 30000,
    connectionTimeoutMillis: parseInt(process.env.DB_POOL_CONNECT_TIMEOUT) || 10000,
    keepAlive: true,
  };

  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: parseSslOption(),
      ...common,
    };
  }

  // Fallback to discrete vars (useful for local development)
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'postgres',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: parseSslOption(),
    ...common,
  };
};

const poolConfig = buildPoolConfig();

// Validate we actually have something to connect with
if (!process.env.DATABASE_URL && !process.env.DB_HOST) {
  const msg = 'FATAL: Neither DATABASE_URL nor DB_HOST is set. Cannot connect to PostgreSQL.';
  logger.error(msg);
  throw new Error(msg);
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