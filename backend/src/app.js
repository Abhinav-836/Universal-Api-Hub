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
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else if (!isProduction) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
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
    'X-RateLimit-Warning'
  ],
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

// ==================== SECURITY ====================
app.use(helmet({
  crossOriginOpenerPolicy: { policy: "same-origin" },
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: [
        "'self'",
        "https://universal-api-hub.onrender.com",
        "https://universal-api-hub.vercel.app",
        ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : [])
      ],
      baseUri: ["'self'"],
      fontSrc: ["'self'", "https:", "data:"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: isProduction ? [] : null,
    }
  }
}));

// ==================== STRIPE WEBHOOK ====================
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
    if (isProduction) {
      return hasAuthCredential(req) ? 500 : 200;
    }
    return 1000;
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.sessionID || req.ip,
  skip: (req) => req.path === '/health' || req.path === '/',
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many requests, please try again later.',
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
    });
  }
});

app.use('/api', limiter);
app.use('/auth', limiter);

// ==================== ROUTES ====================
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Universal API Hub API',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.use('/auth', authRoutes);
app.use('/api', apiRoutes);
app.use('/api/user', userRoutes);

// ==================== ERRORS ====================
app.use(errorHandler);

app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.path,
    method: req.method
  });
});

module.exports = app;