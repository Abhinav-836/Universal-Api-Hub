// backend/src/app.js
require('dotenv').config();
const express     = require('express');
const helmet      = require('helmet');
const cors        = require('cors');
const compression = require('compression');
const morgan      = require('morgan');
const logger      = require('./utils/logger');
const { ipRateLimit } = require('./middleware/rateLimiter');
const authRoutes  = require('./routes/auth.routes');
const userRoutes  = require('./routes/user.routes');
const apiRoutes   = require('./routes/api.routes');

const app = express();

// ── Trust proxy (for correct req.ip behind nginx) ─────────────
app.set('trust proxy', 1);

// ── Security headers ─────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'"],
      styleSrc:   ["'self'", "'unsafe-inline'"],
      imgSrc:     ["'self'", 'data:', 'https:'],
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  frameguard: { action: 'deny' },
  referrerPolicy: { policy: 'same-origin' }
}));

// ── CORS ──────────────────────────────────────────────────────
app.use(cors({
  origin:         process.env.FRONTEND_URL || 'http://localhost:3000',
  methods:        ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  exposedHeaders: [
    'X-RateLimit-Limit', 'X-RateLimit-Remaining',
    'X-RateLimit-Used',  'X-RateLimit-Reset', 'X-RateLimit-Warning',
  ],
  credentials: true,
}));

// ── Stripe Webhook (must be before body parser for raw body) ──
const UserController = require('./controllers/user.controller');
app.post('/webhook/stripe', express.raw({ type: 'application/json' }), UserController.stripeWebhook);

// ── Body parsing & compression ────────────────────────────────
app.use(compression());

// Allow 5MB payloads specifically for image analysis routes
app.use('/api/v1/image/analyze', express.json({ limit: '5mb' }));
app.use('/api/v1/image/analyze', express.urlencoded({ extended: true, limit: '5mb' }));

// Apply strict 100kb limit globally to all other routes
app.use(express.json({ limit: '100kb' })); 
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// ── HTTP request logging ──────────────────────────────────────
app.use(morgan('combined', {
  stream: { write: (msg) => logger.info(msg.trim(), { type: 'http' }) },
  skip: (req) => req.path === '/health',
}));

// ── Global IP abuse protection ────────────────────────────────
app.use(ipRateLimit);

// ── Health check ──────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({
  status:    'ok',
  service:   'Universal API Hub',
  version:   '1.0.0',
  env:       process.env.NODE_ENV,
  timestamp: new Date().toISOString(),
}));

// ── Routes ────────────────────────────────────────────────────
app.use('/auth',     authRoutes);   // JWT auth
app.use('/api/user', userRoutes);   // Dashboard + key mgmt (JWT)
app.use('/api',      apiRoutes);    // v1 API endpoints (API Key)

// ── 404 handler ───────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error:   `Route not found: ${req.method} ${req.path}`,
  });
});

// ── Global error handler ──────────────────────────────────────
app.use((err, req, res, _next) => {
  logger.error('Unhandled error', {
    error:  err.message,
    stack:  process.env.NODE_ENV !== 'production' ? err.stack : undefined,
    url:    req.originalUrl,
    method: req.method,
    ip:     req.ip,
  });

  const status = err.statusCode || err.status || 500;
  res.status(status).json({
    success: false,
    error:   process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

module.exports = app;
