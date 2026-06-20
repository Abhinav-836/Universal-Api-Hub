// backend/src/server.js
console.log('🔥 Server script started');
require('dotenv').config();
console.log('📦 Environment loaded. Checking variables...');

try {
  require('./config/env').validateEnv();
  console.log('✅ env validated');
} catch (err) {
  console.error('❌ validateEnv error:', err.message);
  console.error(err.stack);
  process.exit(1);
}

console.log('📌 Requiring app...');
const app = require('./app');
console.log('✅ app loaded');

const { testConnection: testDb } = require('./config/db');
const { testConnection: testRedis } = require('./config/redis');
const logger = require('./utils/logger');

const PORT = parseInt(process.env.PORT) || 5000;

const start = async () => {
  console.log('🚀 Starting server...');
  logger.info('Starting Universal API Hub server...');

  // Check connections
  const [dbOk, redisOk] = await Promise.all([testDb(), testRedis()]);

  if (!dbOk) {
    logger.warn('PostgreSQL not available — DB-dependent features will fail');
  }
  if (!redisOk) {
    logger.warn('Redis not available — rate limiting and caching will be degraded');
  }

  const server = app.listen(PORT, () => {
    logger.info(`🚀 Server running on port ${PORT}`, {
      env:   process.env.NODE_ENV,
      port:  PORT,
      db:    dbOk    ? 'connected' : 'unavailable',
      redis: redisOk ? 'connected' : 'unavailable',
    });
    console.log(`🚀 Server running on port ${PORT}`);
  });

  // Graceful shutdown
  const shutdown = async (signal) => {
    logger.info(`${signal} received — shutting down gracefully`);
    server.close(async () => {
      const { pool } = require('./config/db');
      await pool.end().catch(() => {});
      const { getRedis } = require('./config/redis');
      const redisClient = getRedis();
      if (redisClient && redisClient.status !== 'end') {
        await redisClient.quit().catch(() => {});
      }
      logger.info('Server shut down complete');
      process.exit(0);
    });
    setTimeout(() => { logger.error('Forced shutdown'); process.exit(1); }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
};

// --- CALL START ---
start().catch((err) => {
  console.error('❌ Failed to start server:', err.message);
  console.error(err.stack);
  logger.error('Failed to start server', { error: err.message, stack: err.stack });
  process.exit(1);
});