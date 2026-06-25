// backend/src/routes/user.routes.js
const express  = require('express');
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

// ── Plan Upgrade (Stripe - Optional) ──────────────────────────
router.post('/checkout', 
  [body('plan').isIn(['free', 'pro', 'premium'])], 
  UserController.createCheckoutSession
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