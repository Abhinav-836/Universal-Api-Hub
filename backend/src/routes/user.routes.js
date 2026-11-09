// backend/src/routes/user.routes.js
const express  = require('express');
const rateLimit = require('express-rate-limit');
const { body } = require('express-validator');
const { jwtAuth } = require('../middleware/auth.middleware');
const UserController = require('../controllers/user.controller');
// ✅ Import ApiKeyController directly from api.controller
const { ApiKeyController } = require('../controllers/api.controller');

const router = express.Router();

// All routes in this file require a valid JWT
router.use(jwtAuth);

// ── Dashboard ─────────────────────────────────────────────────
router.get('/dashboard', UserController.getDashboard);
router.get('/usage',     UserController.getUsage);
router.get('/apis',      UserController.getApis);

// ── Plan Management ──────────────────────────────────────
router.get('/plans', UserController.getPlans);
router.get('/plan-features', UserController.getPlanFeatures);
router.post('/select-plan',
  [body('plan').isIn(['free', 'pro', 'premium']).withMessage('Invalid plan')],
  UserController.selectPlan
);

// ── API Selection ─────────────────────────────────────────────
router.post('/apis/select',
  [body('apiId').isUUID().withMessage('Valid API ID required')],
  UserController.selectApi
);
router.delete('/apis/:apiId', UserController.deselectApi);

// ── Paid plans (Razorpay) ─────────────────────────────────────
// Each checkout creates a Razorpay order; cap it so nobody can flood your
// Razorpay account with orders (per user, not per IP).
const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `checkout:${req.user.id}`,
  message: { success: false, error: 'Too many checkout attempts. Please wait a few minutes.' },
});

router.post('/checkout',
  checkoutLimiter,
  [body('plan').isIn(['pro', 'premium']).withMessage('Choose the pro or premium plan')],
  UserController.createCheckout
);
router.post('/checkout/verify',
  checkoutLimiter,
  [
    body('orderId').isString().matches(/^order_[A-Za-z0-9]{6,40}$/),
    body('paymentId').isString().matches(/^pay_[A-Za-z0-9]{6,40}$/),
    body('signature').isString().isHexadecimal().isLength({ min: 64, max: 64 }),
  ],
  UserController.verifyCheckout
);

// ── Wallet (prepaid AI credits) ───────────────────────────────
router.get('/wallet', UserController.getWallet);
router.post('/wallet/topup',
  checkoutLimiter,
  [body('amountInr').isInt({ min: 50, max: 10000 }).toInt().withMessage('Add between ₹50 and ₹10,000')],
  UserController.createTopup
);

// ── API Key Management ────────────────────────────────────────
// ✅ Use ApiKeyController methods
router.get('/keys',    ApiKeyController.list);
router.post('/keys',
  [
    body('label').optional().isLength({ max: 100 }).trim(),
    body('keyType').optional().isIn(['dev', 'prod', 'test']),
    body('scopedApis').optional().isArray(),
    body('expiresAt').optional().isISO8601(),
  ],
  ApiKeyController.create
);
router.delete('/keys/:keyId', ApiKeyController.revoke);
router.patch('/keys/:keyId/scopes', 
  [
    body('scopedApis').isArray({ max: 50 }).withMessage('scopedApis must be an array of max 50 items'),
    body('scopedApis.*').isString().trim().isLength({ max: 50 })
  ],
  ApiKeyController.updateScopes
);

module.exports = router;