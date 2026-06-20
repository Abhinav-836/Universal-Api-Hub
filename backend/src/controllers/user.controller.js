// backend/src/controllers/user.controller.js
const { validationResult } = require('express-validator');
const UserModel    = require('../models/user.model');
const ApiModel     = require('../models/api.model');
const ApiKeyService = require('../services/apiKey.service');
const UsageService = require('../services/usage.service');
const RateLimitService = require('../services/rateLimit.service');
const { getRedis, KEYS, TTL } = require('../config/redis');
const { PLANS } = require('../utils/constants');
const logger = require('../utils/logger');

// Stripe is optional - only load if configured
let stripe = null;
try {
  if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY !== 'sk_test_placeholder') {
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  }
} catch (e) { /* stripe not configured */ }

const getCurrentSwitchCount = (user) => {
  const today = new Date().toISOString().split('T')[0];
  const resetDate = user.switch_reset_at
    ? String(user.switch_reset_at).slice(0, 10)
    : today;
  return resetDate < today ? 0 : user.api_switch_count;
};

const UserController = {
  /** GET /user/dashboard — full dashboard data */
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

      res.json({
        success: true,
        dashboard: {
          user:      { ...req.user, planConfig },
          usage,
          stats,
          apiBreakdown,
          userApis,
          allApis,
          apiKeys,
          recentRequests: recent,
        },
      });
    } catch (err) {
      logger.error('Dashboard error', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  },

  /** GET /user/usage */
  getUsage: async (req, res) => {
    try {
      const [usage, stats, breakdown] = await Promise.all([
        RateLimitService.getUsage(req.user.id, req.user.plan),
        UsageService.getUserStats(req.user.id),
        UsageService.getApiBreakdown(req.user.id),
      ]);
      res.json({ success: true, usage, stats, breakdown });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  },

  /**
   * 🆕 SELECT PLAN - User can freely choose their plan
   * This replaces the Stripe checkout for now
   */
  selectPlan: async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    try {
      const { plan } = req.body;
      const userId = req.user.id;

      // Validate plan
      const validPlans = ['free', 'pro', 'premium'];
      if (!validPlans.includes(plan)) {
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid plan. Choose from: free, pro, premium' 
        });
      }

      // Update user's plan
      const updatedUser = await UserModel.updatePlan(userId, plan);

      // If upgrading to premium, auto-grant all APIs
      if (plan === 'premium') {
        const allApis = await ApiModel.findAll();
        await Promise.all(allApis.map(api => ApiModel.grantAccess(userId, api.id)));
        
        // Clear cache
        const redis = getRedis();
        await redis.del(KEYS.userApisCache(userId)).catch(() => {});
      }

      // Clear user cache
      const redis = getRedis();
      await redis.del(KEYS.userCache(userId)).catch(() => {});

      logger.info(`User ${userId} selected plan: ${plan}`);

      res.json({
        success: true,
        message: `Plan updated to ${plan} successfully!`,
        plan: plan,
        user: updatedUser,
        planFeatures: PLANS[plan],
      });

    } catch (err) {
      logger.error('Select plan error', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  },

  /**
   * 🆕 GET PLAN INFO - Returns all plan details
   */
  getPlans: async (req, res) => {
    try {
      const currentPlan = req.user?.plan || 'free';
      
      // Get all available APIs grouped by plan
      const allApis = await ApiModel.findAll();
      
      const plans = Object.keys(PLANS).map(planKey => {
        const planData = PLANS[planKey];
        const apisForPlan = allApis.filter(api => {
          const planOrder = { free: 0, pro: 1, premium: 2 };
          return planOrder[api.min_plan] <= planOrder[planKey];
        });
        
        return {
          key: planKey,
          name: planData.name,
          dailyLimit: planData.dailyLimit,
          apiSlots: planData.apiSlots === Infinity ? 'Unlimited' : planData.apiSlots,
          switchesPerDay: planData.switchesPerDay === Infinity ? 'Unlimited' : planData.switchesPerDay,
          allowedTiers: planData.allowedTiers,
          isCurrent: planKey === currentPlan,
          availableApis: apisForPlan.map(api => ({
            slug: api.slug,
            name: api.name,
            description: api.description,
          })),
          // Additional plan info
          alphaVantageCallsPerMin: planData.alphaVantageCallsPerMin || 5,
          yahooFinanceCallsPerMin: planData.yahooFinanceCallsPerMin || 10,
          llmModels: planData.llmModels || [],
        };
      });

      res.json({
        success: true,
        currentPlan,
        plans,
        upgradeMessage: 'Select a plan to upgrade. No payment required during beta!',
      });

    } catch (err) {
      logger.error('Get plans error', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  },

  /** POST /user/apis/select — select an API */
  selectApi: async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    try {
      const { apiId } = req.body;
      const userId = req.user.id;
      const plan   = req.user.plan;
      const planConfig = PLANS[plan];

      // Premium users don't need to select
      if (plan === 'premium') {
        return res.status(400).json({ 
          success: false, 
          error: 'Premium users have access to all APIs automatically' 
        });
      }

      // Check slot limit
      const currentCount = await ApiModel.countUserApis(userId);
      if (currentCount >= planConfig.apiSlots) {
        return res.status(403).json({
          success: false,
          error: `Your ${plan} plan allows ${planConfig.apiSlots} APIs. Upgrade to add more.`,
          upgradeRequired: true,
        });
      }

      // Check switch limit
      const user = await UserModel.findById(userId);
      const currentSwitches = getCurrentSwitchCount(user);

      if (planConfig.switchesPerDay !== Infinity && currentSwitches >= planConfig.switchesPerDay) {
        return res.status(429).json({
          success: false,
          error: `You have reached the daily API switch limit (${planConfig.switchesPerDay}/day). Try again tomorrow.`,
        });
      }

      // Verify the API exists and user's plan can access it
      const api = await ApiModel.findById(apiId);
      if (!api) return res.status(404).json({ success: false, error: 'API not found' });

      const planOrder = { free: 0, pro: 1, premium: 2 };
      if (planOrder[api.min_plan] > planOrder[plan]) {
        return res.status(403).json({
          success: false,
          error: `This API requires the ${api.min_plan} plan. Please upgrade.`,
          upgradeRequired: true,
        });
      }

      await ApiModel.grantAccess(userId, apiId);
      await UserModel.incrementSwitchCount(userId);

      // Invalidate cache
      const redis = getRedis();
      await redis.del(KEYS.userApisCache(userId)).catch(() => {});

      res.json({ success: true, message: `Access granted to ${api.name}` });
    } catch (err) {
      logger.error('Select API error', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  },

  /** DELETE /user/apis/:apiId — deselect an API */
  deselectApi: async (req, res) => {
    try {
      const { apiId } = req.params;
      const userId = req.user.id;
      const plan = req.user.plan;
      const planConfig = PLANS[plan];

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

      await ApiModel.revokeAccess(userId, apiId);
      await UserModel.incrementSwitchCount(userId);

      const redis = getRedis();
      await redis.del(KEYS.userApisCache(userId)).catch(() => {});

      res.json({ success: true, message: 'API access removed' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  },

  /** POST /user/checkout — Stripe checkout (conditional) */
  createCheckoutSession: async (req, res) => {
    try {
      const { plan } = req.body;
      
      // If Stripe is not configured, use the free plan selection instead
      if (!stripe) {
        // Redirect to plan selection
        return res.status(501).json({
          success: false,
          error: 'Stripe is not configured. Please use the /api/user/select-plan endpoint instead.',
          fallback: '/api/user/select-plan',
          message: 'Payment not required during beta. Select a plan directly!',
        });
      }

      const planPrices = {
        pro: process.env.STRIPE_PRICE_ID_PRO,
        premium: process.env.STRIPE_PRICE_ID_PREMIUM
      };
      
      if (!planPrices[plan]) {
        return res.status(400).json({ success: false, error: 'Invalid plan or missing Stripe price ID' });
      }

      let user = await UserModel.findById(req.user.id);
      let customerId = user.stripe_customer_id;
      
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          metadata: { userId: user.id }
        });
        customerId = customer.id;
        await UserModel.updateStripeCustomer(user.id, customerId);
      }

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [{ price: planPrices[plan], quantity: 1 }],
        mode: 'subscription',
        success_url: `${process.env.FRONTEND_URL}/dashboard?checkout_success=true&plan=${plan}`,
        cancel_url: `${process.env.FRONTEND_URL}/dashboard?checkout_canceled=true`,
        client_reference_id: req.user.id,
        metadata: { userId: req.user.id, plan }
      });
      
      res.json({ success: true, url: session.url });
    } catch (err) {
      logger.error('Checkout error', { error: err.message });
      res.status(500).json({ success: false, error: 'Failed to create checkout session' });
    }
  },

  /** POST /webhook/stripe — secure subscription updates */
  stripeWebhook: async (req, res) => {
    try {
      const sig = req.headers['stripe-signature'];
      const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

      if (!sig || !endpointSecret || !stripe) {
        logger.error('Missing Stripe signature, webhook secret, or SDK');
        return res.status(400).send('Webhook Error: Missing configuration');
      }

      let event;
      try {
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
      } catch (err) {
        logger.error('Webhook signature verification failed', { error: err.message });
        return res.status(400).send(`Webhook Error: ${err.message}`);
      }

      // Idempotency check via Redis
      const redis = getRedis();
      const idempotencyKey = KEYS.webhookEvent(event.id);
      const alreadyProcessed = await redis.set(idempotencyKey, '1', 'NX', 'EX', TTL.ONE_WEEK);
      
      if (!alreadyProcessed) {
        logger.info(`Webhook event ${event.id} already processed. Skipping.`);
        return res.json({ received: true });
      }

      const subscriptionEvents = [
        'customer.subscription.updated', 
        'customer.subscription.created', 
        'customer.subscription.deleted'
      ];

      if (subscriptionEvents.includes(event.type)) {
        const subscription = event.data.object;
        const customerId = subscription.customer;
        const status = subscription.status;
        const priceId = subscription.items.data[0].price.id;
        
        let plan = 'free';
        if (status === 'active' || status === 'trialing') {
          if (priceId === process.env.STRIPE_PRICE_ID_PRO) plan = 'pro';
          if (priceId === process.env.STRIPE_PRICE_ID_PREMIUM) plan = 'premium';
        }

        let userId = subscription.metadata?.userId;
        
        if (!userId) {
          const db = require('../config/db');
          const userRes = await db.query('SELECT id FROM users WHERE stripe_customer_id = $1', [customerId]);
          if (userRes.rows.length > 0) userId = userRes.rows[0].id;
        }

        if (userId) {
          await UserModel.updatePlan(userId, plan);
          await UserModel.updateStripeSubscription(userId, subscription.id, status, priceId);

          const redis = getRedis();
          await redis.del(KEYS.userCache(userId)).catch(() => {});

          if (plan === 'premium') {
            const allApis = await ApiModel.findAll();
            await Promise.all(allApis.map(a => ApiModel.grantAccess(userId, a.id)));
            await redis.del(KEYS.userApisCache(userId)).catch(() => {});
          }
        } else {
          logger.warn(`Stripe webhook: User not found for customer ${customerId}`);
        }
      }

      res.json({ received: true });
    } catch (err) {
      logger.error('Webhook error', { error: err.message, stack: err.stack });
      res.status(500).send(`Webhook Error: Internal failure`);
    }
  },

  /** GET /user/apis — all APIs with user's selection status */
  getApis: async (req, res) => {
    try {
      const [allApis, userApis] = await Promise.all([
        ApiModel.findAll(),
        ApiModel.findUserApis(req.user.id),
      ]);
      const userApiIds = new Set(userApis.map(a => a.id));
      const planOrder = { free: 0, pro: 1, premium: 2 };
      const userPlanLevel = planOrder[req.user.plan] ?? 0;

      const apis = allApis.map(api => ({
        ...api,
        selected: userApiIds.has(api.id),
        accessible: planOrder[api.min_plan] <= userPlanLevel,
        locked: planOrder[api.min_plan] > userPlanLevel,
      }));

      res.json({ success: true, apis, planConfig: PLANS[req.user.plan] });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  },

  /**
   * 🆕 GET PLAN FEATURES - Detailed plan comparison
   */
  getPlanFeatures: async (req, res) => {
    try {
      const allApis = await ApiModel.findAll();
      const planOrder = { free: 0, pro: 1, premium: 2 };
      
      const features = {};
      
      Object.keys(PLANS).forEach(planKey => {
        const planData = PLANS[planKey];
        const apisForPlan = allApis.filter(api => {
          return planOrder[api.min_plan] <= planOrder[planKey];
        });
        
        features[planKey] = {
          name: planData.name,
          dailyRequests: planData.dailyLimit,
          apiSlots: planData.apiSlots === Infinity ? 'Unlimited' : planData.apiSlots,
          apiSwitches: planData.switchesPerDay === Infinity ? 'Unlimited' : planData.switchesPerDay,
          availableApis: apisForPlan.map(api => api.name),
          apiCount: apisForPlan.length,
          rateLimits: {
            alphaVantage: `${planData.alphaVantageCallsPerMin || 5} calls/min`,
            yahooFinance: `${planData.yahooFinanceCallsPerMin || 10} calls/min`,
          },
          llmModels: planData.llmModels || [],
        };
      });

      res.json({
        success: true,
        features,
        currentPlan: req.user?.plan || 'free',
      });
    } catch (err) {
      logger.error('Get plan features error', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  },
};

module.exports = UserController;