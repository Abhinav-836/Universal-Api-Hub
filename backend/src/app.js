const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
const userRoutes = require('./routes/user');
const { errorHandler } = require('./middleware/errorHandler');
const { requestLogger } = require('./middleware/logger');

const app = express();

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

// ==================== MIDDLEWARE ====================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(requestLogger);

// ==================== RATE LIMITING ====================
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: (req) => {
    // Higher limit for authenticated users in production
    if (process.env.NODE_ENV === 'production') {
      return req.user ? 500 : 200;
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