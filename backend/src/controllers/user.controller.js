// backend/src/controllers/user.controller.js
const { validationResult } = require('express-validator');
const UserModel    = require('../models/user.model');
const ApiModel     = require('../models/api.model');
const ApiKeyService = require('../services/apiKey.service');
const UsageService = require('../services/usage.service');
const RateLimitService = require('../services/rateLimit.service');
const AuthService = require('../services/auth.service');
const Billing = require('../services/billing.service');
const Razorpay = require('../services/razorpay.service');
const Wallet = require('../services/wallet.service');
const { applyPlanChange, invalidateUserCaches } = require('../services/plan.service');
const { hasActivePaidPlan } = require('../utils/plan');
const { PLANS } = require('../utils/constants');
const logger = require('../utils/logger');

const PLAN_ORDER = { free: 0, pro: 1, premium: 2 };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Free upgrades are OFF unless BETA_FREE_UPGRADES=true is set explicitly.
// With them off, upgrading goes through Razorpay and /select-plan can only
// be used to move down to the free plan.
const freeUpgradesEnabled = () =>
  String(process.env.BETA_FREE_UPGRADES ?? 'false').toLowerCase() === 'true';

// node-pg parses a DATE column as local midnight, so compare using LOCAL
// date parts. (The old version did String(date).slice(0, 10), which gives
// "Thu Oct 22" — never comparable to "2026-10-22".)
const localYmd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const getCurrentSwitchCount = (user) => {
  const today = localYmd(new Date());
  const resetDate = user.switch_reset_at ? localYmd(new Date(user.switch_reset_at)) : today;
  return resetDate < today ? 0 : user.api_switch_count;
};

const withPlanFlags = (apis, userApis, plan) => {
  const userApiIds = new Set(userApis.map((a) => a.id));
  const userPlanLevel = PLAN_ORDER[plan] ?? 0;
  return apis.map((api) => ({
    ...api,
    selected: userApiIds.has(api.id),
    accessible: PLAN_ORDER[api.min_plan] <= userPlanLevel,
    locked: PLAN_ORDER[api.min_plan] > userPlanLevel,
  }));
};

const UserController = {
  // ==================== DASHBOARD ====================
  getDashboard: async (req, res) => {
    try {
      const userId = req.user.id;
      const plan   = req.user.plan;

      const [usage, stats, apiBreakdown, userApis, allApis, apiKeys, recent] = await Promise.all([
        RateLimitService.getUsage(userId, plan),
        UsageService.getUserStats(userId),
        UsageService.getApiBreakdown(userId),
        ApiModel.findUserApis(userId),
        ApiModel.findAll(),
        ApiKeyService.listForUser(userId),
        UsageService.getRecent(userId, 10),
      ]);

      const planConfig = PLANS[plan];
      const allApisWithFlags = withPlanFlags(allApis, userApis, plan);

      const safeUser = { ...req.user, paid: hasActivePaidPlan(req.user) };
      delete safeUser.password_hash;
      delete safeUser.google_sub;

      const dashboard = {
        user: { ...safeUser, planConfig },
        usage,
        stats,
        apiBreakdown,
        userApis,
        allApis: allApisWithFlags,
        apiKeys,
        recentRequests: recent,
      };

      res.json({
        success: true,
        dashboard,
        todayUsage: { total_requests: usage.used },
        dailyLimit: usage.limit,
        selectedApis: userApis,
        apis: allApisWithFlags,
        apiKeys,
        recentRequests: recent,
        apiBreakdown,
        usageHistory: stats,
      });
    } catch (err) {
      logger.error('Dashboard error', { error: err.message });
      res.status(500).json({ success: false, error: 'Failed to load dashboard' });
    }
  },

  getUsage: async (req, res) => {
    try {
      const [usage, stats, breakdown] = await Promise.all([
        RateLimitService.getUsage(req.user.id, req.user.plan),
        UsageService.getUserStats(req.user.id),
        UsageService.getApiBreakdown(req.user.id),
      ]);
      res.json({ success: true, usage, stats, breakdown });
    } catch (err) {
      logger.error('Usage error', { error: err.message });
      res.status(500).json({ success: false, error: 'Failed to load usage' });
    }
  },

  // ==================== PLAN MANAGEMENT ====================
  selectPlan: async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    try {
      const { plan } = req.body;
      const userId = req.user.id;

      const currentUser = await UserModel.findById(userId);
      if (!currentUser) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      const isUpgrade = (PLAN_ORDER[plan] ?? 0) > (PLAN_ORDER[currentUser.plan] ?? 0);

      // When free upgrades are off, upgrades must go through Razorpay.
      if (isUpgrade && !freeUpgradesEnabled()) {
        return res.status(402).json({
          success: false,
          error: 'Upgrades require payment. Please complete checkout.',
          checkoutRequired: true,
          checkoutAvailable: Razorpay.isConfigured(),
        });
      }

      // Moving between paid plans without paying would hand out the
      // difference for free; paid time is bought per plan through checkout.
      if (!isUpgrade && plan !== 'free' && hasActivePaidPlan(currentUser)) {
        return res.status(400).json({
          success: false,
          error: 'You can switch to the free plan, or buy another plan through checkout.',
        });
      }

      const updatedUser = await applyPlanChange(userId, plan);
      logger.info(`User ${userId} selected plan: ${plan}`);

      const tokenResult = await AuthService.refreshToken(userId);

      res.json({
        success: true,
        message: `Plan updated to ${plan} successfully!`,
        plan,
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          username: updatedUser.username,
          plan: updatedUser.plan,
          created_at: updatedUser.created_at,
        },
        token: tokenResult.token,
        planFeatures: PLANS[plan],
      });
    } catch (err) {
      logger.error('Select plan error', { error: err.message, stack: err.stack });
      res.status(500).json({ success: false, error: 'Failed to update plan' });
    }
  },

  getPlans: async (req, res) => {
    try {
      const currentPlan = req.user?.plan || 'free';
      const allApis = await ApiModel.findAll();

      const plans = Object.keys(PLANS).map((planKey) => {
        const planData = PLANS[planKey];
        const apisForPlan = allApis.filter((api) => PLAN_ORDER[api.min_plan] <= PLAN_ORDER[planKey]);

        return {
          key: planKey,
          name: planData.name,
          dailyLimit: planData.dailyLimit,
          apiSlots: planKey === 'premium' ? 'All' : planData.apiSlots,
          switchesPerDay: planData.switchesPerDay === Infinity ? 'Unlimited' : planData.switchesPerDay,
          allowedTiers: planData.allowedTiers,
          isCurrent: planKey === currentPlan,
          availableApis: apisForPlan.map((api) => ({
            slug: api.slug,
            name: api.name,
            description: api.description,
          })),
          alphaVantageCallsPerMin: planData.alphaVantageCallsPerMin || 5,
          yahooFinanceCallsPerMin: planData.yahooFinanceCallsPerMin || 10,
          llmModels: planData.llmModels || [],
          priceInr: planKey === 'free' ? 0 : Billing.priceInr(planKey),
          days: planKey === 'free' ? null : Billing.PLAN_DAYS,
        };
      });

      const payments = freeUpgradesEnabled() ? 'beta' : Razorpay.isConfigured() ? 'razorpay' : 'off';
      res.json({
        success: true,
        currentPlan,
        planExpiresAt: req.user?.plan_expires_at || null,
        payments,
        plans,
        upgradeMessage:
          payments === 'beta'
            ? 'Select a plan to upgrade. No payment required during beta!'
            : payments === 'razorpay'
              ? `Pay once for ${Billing.PLAN_DAYS} days. No auto-renewal.`
              : 'Paid plans are not available yet.',
      });
    } catch (err) {
      logger.error('Get plans error', { error: err.message });
      res.status(500).json({ success: false, error: 'Failed to load plans' });
    }
  },

  getPlanFeatures: async (req, res) => {
    try {
      const allApis = await ApiModel.findAll();
      const features = {};

      Object.keys(PLANS).forEach((planKey) => {
        const planData = PLANS[planKey];
        const apisForPlan = allApis.filter((api) => PLAN_ORDER[api.min_plan] <= PLAN_ORDER[planKey]);

        features[planKey] = {
          name: planData.name,
          dailyRequests: planData.dailyLimit,
          apiSlots: planKey === 'premium' ? 'All' : planData.apiSlots,
          apiSwitches: planData.switchesPerDay === Infinity ? 'Unlimited' : planData.switchesPerDay,
          availableApis: apisForPlan.map((api) => api.name),
          apiCount: apisForPlan.length,
          rateLimits: {
            alphaVantage: `${planData.alphaVantageCallsPerMin || 5} calls/min`,
            yahooFinance: `${planData.yahooFinanceCallsPerMin || 10} calls/min`,
          },
          llmModels: planData.llmModels || [],
        };
      });

      res.json({ success: true, features, currentPlan: req.user?.plan || 'free' });
    } catch (err) {
      logger.error('Get plan features error', { error: err.message });
      res.status(500).json({ success: false, error: 'Failed to load plan features' });
    }
  },

  // ==================== API SELECTION ====================
  selectApi: async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    try {
      const { apiId } = req.body;
      const userId = req.user.id;
      const plan   = req.user.plan;
      const planConfig = PLANS[plan] || PLANS.free;

      if (plan === 'premium') {
        return res.status(400).json({
          success: false,
          error: 'Premium users have access to all APIs automatically',
        });
      }

      const api = await ApiModel.findById(apiId);
      if (!api) return res.status(404).json({ success: false, error: 'API not found' });

      if (PLAN_ORDER[api.min_plan] > PLAN_ORDER[plan]) {
        return res.status(403).json({
          success: false,
          error: `This API requires the ${api.min_plan} plan. Please upgrade.`,
          upgradeRequired: true,
        });
      }

      // FIX: re-selecting an already-selected API used to burn a switch
      // (and hit the slot limit check). Treat it as a no-op.
      if (await ApiModel.userHasAccessById(userId, apiId)) {
        return res.json({ success: true, message: `You already have access to ${api.name}` });
      }

      const currentCount = await ApiModel.countUserApis(userId);
      if (currentCount >= planConfig.apiSlots) {
        return res.status(403).json({
          success: false,
          error: `Your ${plan} plan allows ${planConfig.apiSlots} APIs. Upgrade to add more.`,
          upgradeRequired: true,
        });
      }

      const user = await UserModel.findById(userId);
      const currentSwitches = getCurrentSwitchCount(user);
      if (planConfig.switchesPerDay !== Infinity && currentSwitches >= planConfig.switchesPerDay) {
        return res.status(429).json({
          success: false,
          error: `You have reached the daily API switch limit (${planConfig.switchesPerDay}/day). Try again tomorrow.`,
        });
      }

      const granted = await ApiModel.grantAccess(userId, apiId);
      if (granted) await UserModel.incrementSwitchCount(userId);

      await invalidateUserCaches(userId);

      res.json({ success: true, message: `Access granted to ${api.name}` });
    } catch (err) {
      logger.error('Select API error', { error: err.message });
      res.status(500).json({ success: false, error: 'Failed to select API' });
    }
  },

  deselectApi: async (req, res) => {
    try {
      const { apiId } = req.params;
      const userId = req.user.id;
      const plan = req.user.plan;
      const planConfig = PLANS[plan] || PLANS.free;

      // FIX: a non-UUID id used to reach Postgres and 500.
      if (!UUID_RE.test(String(apiId))) {
        return res.status(400).json({ success: false, error: 'Valid API ID required' });
      }

      if (plan !== 'premium') {
        const user = await UserModel.findById(userId);
        const currentSwitches = getCurrentSwitchCount(user);
        if (planConfig.switchesPerDay !== Infinity && currentSwitches >= planConfig.switchesPerDay) {
          return res.status(429).json({
            success: false,
            error: `You have reached the daily API switch limit (${planConfig.switchesPerDay}/day). Try again tomorrow.`,
          });
        }
      }

      const revoked = await ApiModel.revokeAccess(userId, apiId);
      if (!revoked) {
        return res.status(404).json({ success: false, error: 'You do not have this API selected' });
      }
      await UserModel.incrementSwitchCount(userId);
      await invalidateUserCaches(userId);

      res.json({ success: true, message: 'API access removed' });
    } catch (err) {
      logger.error('Deselect API error', { error: err.message });
      res.status(500).json({ success: false, error: 'Failed to remove API' });
    }
  },

  getApis: async (req, res) => {
    try {
      const [allApis, userApis] = await Promise.all([
        ApiModel.findAll(),
        ApiModel.findUserApis(req.user.id),
      ]);
      const apis = withPlanFlags(allApis, userApis, req.user.plan);
      res.json({ success: true, apis, planConfig: PLANS[req.user.plan] });
    } catch (err) {
      logger.error('Get APIs error', { error: err.message });
      res.status(500).json({ success: false, error: 'Failed to load APIs' });
    }
  },

  // ==================== RAZORPAY CHECKOUT ====================
  // Step 1: create an order. The browser opens Razorpay Checkout with it.
  createCheckout: async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    try {
      const user = await UserModel.findById(req.user.id);
      if (!user) return res.status(404).json({ success: false, error: 'User not found' });
      const checkout = await Billing.createCheckout(user, req.body.plan);
      res.json({ success: true, checkout });
    } catch (err) {
      if (!err.statusCode) logger.error('Checkout error', { error: err.message });
      res.status(err.statusCode || 500).json({ success: false, error: err.statusCode ? err.message : 'Failed to start checkout' });
    }
  },

  // Step 2: Checkout succeeded in the browser. Check it and give the plan.
  verifyCheckout: async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    try {
      const { orderId, paymentId, signature } = req.body;
      const result = await Billing.verifyCheckout(req.user, { orderId, paymentId, signature });
      const tokenResult = await AuthService.refreshToken(req.user.id);
      const user = await UserModel.findById(req.user.id);
      res.json({
        success: true,
        kind: result.kind === 'credits' ? 'credits' : 'plan',
        plan: user.plan,
        planExpiresAt: user.plan_expires_at,
        balancePaise: await Wallet.balance(req.user.id),
        alreadyPaid: !!result.alreadyPaid,
        token: tokenResult.token,
      });
    } catch (err) {
      if (!err.statusCode) logger.error('Checkout verify error', { error: err.message });
      res.status(err.statusCode || 500).json({ success: false, error: err.statusCode ? err.message : 'Could not confirm the payment' });
    }
  },

  // ==================== WALLET (AI credits) ====================
  getWallet: async (req, res) => {
    try {
      const [balancePaise, transactions] = await Promise.all([
        Wallet.balance(req.user.id),
        Wallet.history(req.user.id, 20),
      ]);
      res.json({
        success: true,
        balancePaise,
        minBalancePaise: Wallet.minBalancePaise(),
        topup: { minInr: Billing.TOPUP_MIN_INR, maxInr: Billing.TOPUP_MAX_INR, presetsInr: [100, 250, 500, 1000] },
        payments: Razorpay.isConfigured() ? 'razorpay' : 'off',
        transactions,
      });
    } catch (err) {
      logger.error('Wallet error', { error: err.message });
      res.status(500).json({ success: false, error: 'Failed to load wallet' });
    }
  },

  createTopup: async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    try {
      const user = await UserModel.findById(req.user.id);
      if (!user) return res.status(404).json({ success: false, error: 'User not found' });
      const checkout = await Billing.createTopup(user, req.body.amountInr);
      res.json({ success: true, checkout });
    } catch (err) {
      if (!err.statusCode) logger.error('Top-up error', { error: err.message });
      res.status(err.statusCode || 500).json({ success: false, error: err.statusCode ? err.message : 'Failed to start the top-up' });
    }
  },

  // Razorpay → us. Mounted with a raw body (the signature covers the exact bytes).
  razorpayWebhook: async (req, res) => {
    const signature = req.headers['x-razorpay-signature'];
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    if (!Razorpay.verifyWebhookSignature(raw, signature)) {
      logger.warn('Razorpay webhook with a bad or missing signature', { ip: req.ip });
      return res.status(400).json({ success: false, error: 'Invalid signature' });
    }
    let event;
    try {
      event = JSON.parse(raw.toString('utf8'));
    } catch {
      return res.status(400).json({ success: false, error: 'Invalid body' });
    }
    try {
      await Billing.handleWebhook(event);
      res.json({ received: true });
    } catch (err) {
      // 5xx makes Razorpay retry later; confirming is idempotent.
      logger.error('Razorpay webhook failed', { event: event?.event, error: err.message });
      res.status(500).json({ received: false });
    }
  },
};

module.exports = UserController;