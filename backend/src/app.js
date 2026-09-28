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

// ==================== CORS CONFIGURATION ====================
const allowedOrigins = [
  'https://universal-api-hub.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
  process.env.FRONTEND_URL,
  process.env.CORS_ORIGIN
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV !== 'production') {
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
    'Access-Control-Allow-Origin',
    'Access-Control-Allow-Headers',
    'Access-Control-Allow-Credentials'
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

// ==================== SECURITY HEADERS ====================
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
      upgradeInsecureRequests: []
    }
  }
}));

// ==================== STRIPE WEBHOOK ====================
// BUG FIX: UserController.stripeWebhook existed but was never mounted
// anywhere, so Stripe's subscription events never reached the app and paid
// upgrades/cancellations never changed a user's plan (POST /webhook/stripe
// just 404'd). It must be registered BEFORE the JSON body parser below:
// stripe.webhooks.constructEvent() verifies the signature against the exact
// raw request bytes, which express.json() would otherwise consume/alter.
app.post('/webhook/stripe', express.raw({ type: 'application/json' }), UserController.stripeWebhook);

// ==================== MIDDLEWARE ====================
// BUG FIX: the backend's own test suite (tests/app.test.js) asserts a
// "100kb payload size limit globally" and expects 413 for anything larger —
// but this was set to a blanket 10mb for every route, so that test has been
// failing (silently, unless someone actually runs `npm test`). A flat 100kb
// cap everywhere would in turn break /api/v1/image/analyze, which
// intentionally accepts base64-encoded images up to ~5MB
// (see routes/api.routes.js: body('imageBase64')...isLength({ max: 5000000 })).
// Fixed by keeping a strict small default (matches the test) and only
// widening the limit for the one route that legitimately needs it.
const STRICT_JSON_LIMIT = '100kb';
const IMAGE_JSON_LIMIT = '7mb'; // headroom over the 5,000,000-char base64 cap
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

// ==================== RATE LIMITING ====================
// BUG FIX: this limiter is mounted globally, before any auth middleware runs
// (jwtAuth / apiKeyAuth live inside the route files, mounted further down).
// That meant `req.user` was ALWAYS undefined here, so the "500 for
// authenticated users" branch was dead code — every request in production
// silently got the 200/min anonymous limit. Since we can't cheaply verify a
// credential this early without duplicating auth logic, we instead detect
// the mere *presence* of a credential (JWT cookie/Authorization header, or
// an X-API-Key header) as a signal to grant the higher ceiling. This is a
// coarse allowance (not a security check — the real per-user quota is
// enforced later by userRateLimit/RateLimitService), just meant to stop
// legitimate logged-in traffic from being throttled at the same rate as
// anonymous traffic.
const hasAuthCredential = (req) => {
  if (req.headers['x-api-key']) return true;
  if (req.headers.authorization?.startsWith('Bearer ')) return true;
  const cookieHeader = req.headers.cookie || '';
  return /(?:^|;\s*)(jwt|token)=/.test(cookieHeader);
};

const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: (req) => {
    // Higher limit for requests carrying a credential in production
    if (process.env.NODE_ENV === 'production') {
      return hasAuthCredential(req) ? 500 : 200;
    }
    return 1000; // Development
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use session ID or user ID if available, fallback to IP
    return req.user?.id || req.sessionID || req.ip;
  },
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/health' || req.path === '/';
  },
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many requests, please try again later.',
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
    });
  }
});

app.use('/api', limiter);
app.use('/auth', limiter);

// ==================== COOKIE PARSER OPTIONS ====================
// This is important for cross-domain cookie handling
app.use((req, res, next) => {
  // Ensure cookies are parsed
  next();
});

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

// Auth routes (public)
app.use('/auth', authRoutes);

// API routes (protected)
app.use('/api', apiRoutes);
app.use('/api/user', userRoutes);

// ==================== ERROR HANDLING ====================
app.use(errorHandler);

// ==================== 404 HANDLER ====================
app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.path,
    method: req.method
  });
});

module.exports = app;