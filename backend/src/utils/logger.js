// backend/src/utils/logger.js
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');

const LOG_DIR = process.env.LOG_DIR || './logs';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const isProduction = process.env.NODE_ENV === 'production';

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} [${level}]: ${message}${metaStr}`;
  })
);

const transports = [];

// In production on ephemeral filesystems, prefer stdout only.
// In dev, write files + console.
if (isProduction) {
  transports.push(new winston.transports.Console({ format: consoleFormat }));
} else {
  transports.push(new winston.transports.Console({ format: consoleFormat }));
  try {
    transports.push(new DailyRotateFile({
      dirname:      LOG_DIR,
      filename:     'app-%DATE%.log',
      datePattern:  'YYYY-MM-DD',
      zippedArchive: true,
      maxSize:      '20m',
      maxFiles:     '14d',
      format:       logFormat,
    }));
    transports.push(new DailyRotateFile({
      dirname:      LOG_DIR,
      filename:     'error-%DATE%.log',
      datePattern:  'YYYY-MM-DD',
      zippedArchive: true,
      maxSize:      '20m',
      maxFiles:     '30d',
      level:        'error',
      format:       logFormat,
    }));
  } catch (e) {
    // If file logging fails, keep console logging working
  }
}

const logger = winston.createLogger({
  level:      LOG_LEVEL,
  defaultMeta: { service: 'universal-api-hub' },
  transports,
});

logger.request = (req, extra = {}) => {
  logger.info('HTTP Request', {
    method: req.method,
    url:    req.originalUrl,
    ip:     req.ip,
    ua:     req.get('user-agent'),
    ...extra,
  });
};

module.exports = logger;