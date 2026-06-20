// backend/src/utils/logger.js
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

const LOG_DIR = process.env.LOG_DIR || './logs';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

// Custom log format
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

// Rotate file transport for all logs
const fileRotateTransport = new DailyRotateFile({
  dirname:      LOG_DIR,
  filename:     'app-%DATE%.log',
  datePattern:  'YYYY-MM-DD',
  zippedArchive: true,
  maxSize:      '20m',
  maxFiles:     '14d',
  format:       logFormat,
});

// Error-only rotate file
const errorRotateTransport = new DailyRotateFile({
  dirname:      LOG_DIR,
  filename:     'error-%DATE%.log',
  datePattern:  'YYYY-MM-DD',
  zippedArchive: true,
  maxSize:      '20m',
  maxFiles:     '30d',
  level:        'error',
  format:       logFormat,
});

const transports = [
  fileRotateTransport,
  errorRotateTransport,
];

// Console output in non-production and non-test
if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
  transports.push(new winston.transports.Console({ format: consoleFormat }));
}

const logger = winston.createLogger({
  level:      LOG_LEVEL,
  defaultMeta: { service: 'universal-api-hub' },
  transports,
  exceptionHandlers: [
    new DailyRotateFile({
      dirname:   LOG_DIR,
      filename:  'exceptions-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      format:    logFormat,
    }),
  ],
  rejectionHandlers: [
    new DailyRotateFile({
      dirname:   LOG_DIR,
      filename:  'rejections-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      format:    logFormat,
    }),
  ],
});

// Request logging helper
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
