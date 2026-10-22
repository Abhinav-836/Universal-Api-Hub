// backend/src/app.js
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const authRoutes = require('./routes/auth.routes');
const apiRoutes = require('./routes/api.routes');
const userRoutes = require('./routes/user.routes');
const UserController = require('./controllers/user.controller');
const { errorHandler } = require('./middleware/errorHandler');
const { requestLogger } = require('./middleware/logger');
const { ipRateLimit } = require('./middleware/rateLimiter');

const app = express();

app.set('trust proxy', 1);

const isProduction = process.env.NODE_ENV === 'production';

// ==================== CORS ====================
const allowedOrigins = [
  'https://universal-api-hub.vercel.app',
  ...(isProduction ? [] : ['http://localhost:3000', 'http://localhost:5173']),
  process.env.FRONTEND_URL,
  process.env.CORS_ORIGIN,
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1 || !isProduction) {
      return callback(null, true);
    }
    // Reject without throwing: no CORS headers → browser blocks the call.
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-API-Key',
    'X-Requested-With',
    'Accept',
    'Origin',
  ],
  exposedHeaders: [
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Used',
    'X-RateLimit-Reset',
    'X-RateLimit-Warning',
    'X-Data-Source',
    'Retry-After',
  ],
  preflightContinue: false,
  optionsSuccessStatus: 204,
}));

// ==================== SECURITY ====================
app.use(helmet({
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: [
        "'self'",
        'https://universal-api-hub.onrender.com',
        'https://universal-api-hub.vercel.app',
        ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
      ],
      baseUri: ["'self'"],
      fontSrc: ["'self'", 'https:', 'data:'],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: isProduction ? [] : null,
    },
  },
}));

// ==================== STRIPE WEBHOOK (raw body, before JSON parser) ====================
app.post('/webhook/stripe', express.raw({ type: 'application/json' }), UserController.stripeWebhook);

// ==================== BODY PARSERS ====================
const STRICT_JSON_LIMIT = '100kb';
const IMAGE_JSON_LIMIT = '7mb';
const strictJsonParser = express.json({ limit: STRICT_JSON_LIMIT });
const imageJsonParser = express.json({ limit: IMAGE_JSON_LIMIT });

app.use((req, res, next) => {
  if (req.path === '/api/v1/image/analyze') {
    return imageJsonParser(req, res, next);
  }
  return strictJsonParser(req, res, next);
});
app.use(express.urlencoded({ extended: true, limit: STRICT_JSON_LIMIT }));
app.use(cookieParser());
app.use(requestLogger);

// ==================== RATE LIMIT ====================
const hasAuthCredential = (req) => {
  if (req.headers['x-api-key']) return true;
  if (req.headers.authorization?.startsWith('Bearer ')) return true;
  const cookieHeader = req.headers.cookie || '';
  return /(?:^|;\s*)(jwt|token)=/.test(cookieHeader);
};

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: (req) => {
    if (isProduction) return hasAuthCredential(req) ? 500 : 200;
    return 1000;
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  skip: (req) => req.path === '/health' || req.path === '/',
  handler: (req, res) => {
    // FIX: resetTime is a Date; dividing it by 1000 returned an epoch
    // timestamp (~1.7 billion "seconds"), not the seconds to wait.
    const resetMs = req.rateLimit?.resetTime ? req.rateLimit.resetTime.getTime() - Date.now() : 60000;
    const retryAfter = Math.max(1, Math.ceil(resetMs / 1000));
    res.set('Retry-After', String(retryAfter));
    res.status(429).json({
      success: false,
      error: 'Too many requests, please try again later.',
      retryAfter,
    });
  },
});

app.use('/api', limiter);
app.use('/auth', limiter);

// FIX: ipRateLimit (IP_RATE_LIMIT_MAX / IP_RATE_LIMIT_WINDOW_MS) existed
// but was never mounted, so those settings did nothing.
app.use('/api/v1', ipRateLimit);

// ==================== ROUTES ====================
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Universal API Hub API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

app.use('/auth', authRoutes);
app.use('/api', apiRoutes);
app.use('/api/user', userRoutes);

// ==================== 404 + ERRORS ====================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    path: req.path,
    method: req.method,
  });
});

app.use(errorHandler);

module.exports = app;