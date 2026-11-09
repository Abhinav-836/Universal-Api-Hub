// backend/src/middleware/errorHandler.js
const logger = require('../utils/logger');

const errorHandler = (err, req, res, _next) => {
  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || 'Internal Server Error';

  logger.error('Error:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
    statusCode
  });

  // Never show internal error text (database errors, file paths, stack
  // traces) to callers in production; 4xx messages are written for users.
  const expose = statusCode < 500 || process.env.NODE_ENV === 'development';
  res.status(statusCode).json({
    success: false,
    error: expose ? message : 'Something went wrong. Please try again.',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

module.exports = { errorHandler };