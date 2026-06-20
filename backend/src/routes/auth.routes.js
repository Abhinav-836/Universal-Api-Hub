// backend/src/routes/auth.routes.js
const express = require('express');
const { body } = require('express-validator');
const rateLimit = require('express-rate-limit');
const AuthController = require('../controllers/auth.controller');
const { jwtAuth } = require('../middleware/auth.middleware');

const router = express.Router();

// Strict per-IP limiter for auth endpoints — prevents credential stuffing / brute force
// 10 attempts per 15 min per IP; failed requests are counted (skipSuccessfulRequests)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // only count failed attempts toward the limit
  message: { success: false, error: 'Too many authentication attempts. Try again in 15 minutes.' },
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

router.get('/me', jwtAuth, AuthController.me);
router.post('/logout', AuthController.logout);
router.post('/refresh', jwtAuth, AuthController.refresh);

module.exports = router;
