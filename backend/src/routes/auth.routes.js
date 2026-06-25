// backend/src/routes/auth.routes.js
const express = require('express');
const { body } = require('express-validator');
const rateLimit = require('express-rate-limit');
const AuthController = require('../controllers/auth.controller');
const { jwtAuth } = require('../middleware/auth.middleware');

const router = express.Router();

// Less strict limiter for production - 20 attempts per 15 min
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Increased from 10 to 20
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { 
    success: false, 
    error: 'Too many authentication attempts. Please wait 15 minutes.' 
  },
});

// Even less strict for /me endpoint
const meLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { 
    success: false, 
    error: 'Too many requests. Please wait a moment.' 
  },
});

router.post('/register',
  [
    authLimiter,
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('username').isAlphanumeric().isLength({ min: 3, max: 30 }).withMessage('Username must be 3-30 alphanumeric chars'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Password must contain uppercase, lowercase, and number'),
  ],
  AuthController.register
);

router.post('/login',
  [
    authLimiter,
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
  ],
  AuthController.login
);

// /me endpoint - less restrictive rate limit
router.get('/me', meLimiter, jwtAuth, AuthController.me);

router.post('/logout', AuthController.logout);
router.post('/refresh', jwtAuth, AuthController.refresh);

module.exports = router;