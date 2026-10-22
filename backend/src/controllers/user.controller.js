// backend/src/controllers/user.controller.js
const { validationResult } = require('express-validator');
const UserModel    = require('../models/user.model');
const ApiModel     = require('../models/api.model');
const ApiKeyService = require('../services/apiKey.service');
const UsageService = require('../services/usage.service');
const RateLimitService = require('../services/rateLimit.service');
const AuthService = require('../services/auth.service');
const { getRedis, KEYS, TTL } = require('../config/redis');
const { PLANS } = require('../utils/constants');
const logger = require('../utils/logger');

const PLAN_ORDER = { free: 0, pro: 1, premium: 2 };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// FIX: placeholders like "sk_live_xxxxx" used to pass the old check
// (which only rejected the exact string "sk_test_placeholder"), so Stripe
// was initialised with a junk key and checkout 500'd instead of 501.
const isRealStripeKey = (key) =>
  typeof key === 'string' &&
  /^sk_(test|live)_[A-Za-z0-9]{20,}$/.test(key) &&
  !/x{4,}|placeholder/i.test(key);

let stripe = null;
try {
  if (isRealStripeKey(process.env.STRIPE_SECRET_KEY)) {
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  }
} catch (e) { /* stripe not configured */ }

// While true, /select-plan upgrades for free (beta). Set
// BETA_FREE_UPGRADES=false once you start charging — upgrades then require
// Stripe checkout and /select-plan can only be used to downgrade.
const freeUpgradesEnabled = () =>
  String(process.env.BETA_FREE_UPGRADES ?? 'true').toLowerCase() !== 'false';

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

const invalidateUserCaches = async (userId) => {
  const redis = getRedis();
  await Promise.allSettled([
    redis.del(KEYS.userCache(userId)),
    redis.del(`user:${userId}:plan`),
    redis.del(KEYS.userApisCache(userId)),
    ApiKeyService.invalidateUserKeys(userId),
  ]);
};

/**
 * Single place that changes a user's plan. Always re-syncs API grants so a
 * downgrade (manual, or Stripe cancellation) removes paid-tier access.
 */
const applyPlanChange = async (userId, plan) => {
  const updatedUser = await UserModel.updatePlan(userId, plan);
  await ApiModel.syncAccessForPlan(userId, plan, PLANS[plan]?.apiSlots);
  await invalidateUserCaches(userId);
  return updatedUser;
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

      const safeUser = { ...req.user };
      delete safeUser.stripe_customer_id;
      delete safeUser.stripe_subscription_id;
      delete safeUser.stripe_price_id;

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

      // FIX: when free upgrades are off, upgrades must go through Stripe.
      if (isUpgrade && !freeUpgradesEnabled()) {
        return res.status(402).json({
          success: false,
          error: 'Upgrades require payment. Please complete checkout.',
          checkoutRequired: true,
          checkoutAvailable: !!stripe,
        });
      }

      // FIX: a user with a live Stripe subscription who moves to free via
      // this route used to keep being billed. Cancel it first.
      if (
        plan === 'free' &&
        stripe &&
        currentUser.stripe_subscription_id &&
        ['active', 'trialing', 'past_due'].includes(currentUser.billing_status)
      ) {
        try {
          await stripe.subscriptions.cancel(currentUser.stripe_subscription_id);
          await UserModel.updateStripeSubscription(
            userId, currentUser.stripe_subscription_id, 'canceled', currentUser.stripe_price_id
          );
        } catch (err) {
          logger.error('Failed to cancel Stripe subscription on downgrade', { userId, error: err.message });
          return res.status(502).json({
            success: false,
            error: 'Could not cancel your subscription. Please try again.',
          });
        }
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
        isStripe: false,
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
        };
      });

      res.json({
        success: true,
        currentPlan,
        plans,
        upgradeMessage: freeUpgradesEnabled()
          ? 'Select a plan to upgrade. No payment required during beta!'
          : 'Upgrade through secure checkout.',
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

  // ==================== STRIPE CHECKOUT ====================
  createCheckoutSession: async (req, res) => {
    // FIX: the route's validator ran but its result was never checked here.
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    if (!['pro', 'premium'].includes(req.body.plan)) {
      return res.status(400).json({ success: false, error: 'Checkout is only available for pro or premium' });
    }

    try {
      const { plan } = req.body;

      if (!stripe) {
        return res.status(501).json({
          success: false,
          error: 'Payments are not configured yet.',
        });
      }

      const planPrices = {
        pro: process.env.STRIPE_PRICE_ID_PRO,
        premium: process.env.STRIPE_PRICE_ID_PREMIUM,
      };

      if (!planPrices[plan]) {
        return res.status(400).json({ success: false, error: 'Invalid plan or missing Stripe price ID' });
      }

      const frontendUrl = process.env.FRONTEND_URL;
      if (!frontendUrl) {
        logger.error('FRONTEND_URL not set — cannot build checkout redirect URLs');
        return res.status(500).json({ success: false, error: 'Checkout is misconfigured' });
      }

      const user = await UserModel.findById(req.user.id);
      let customerId = user.stripe_customer_id;

      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          metadata: { userId: user.id },
        });
        customerId = customer.id;
        await UserModel.updateStripeCustomer(user.id, customerId);
      }

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [{ price: planPrices[plan], quantity: 1 }],
        mode: 'subscription',
        success_url: `${frontendUrl}/dashboard?checkout_success=true&plan=${plan}`,
        cancel_url: `${frontendUrl}/dashboard?checkout_canceled=true`,
        client_reference_id: req.user.id,
        metadata: { userId: req.user.id, plan },
        // FIX: metadata on the session does NOT propagate to the
        // subscription, so the webhook could never read userId from it.
        subscription_data: { metadata: { userId: req.user.id, plan } },
      });

      res.json({ success: true, url: session.url });
    } catch (err) {
      logger.error('Checkout error', { error: err.message });
      res.status(500).json({ success: false, error: 'Failed to create checkout session' });
    }
  },

  stripeWebhook: async (req, res) => {
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
      return res.status(400).send('Webhook Error: Invalid signature');
    }

    // FIX: the idempotency key used to be written BEFORE processing, so if
    // processing failed, Stripe's retry was skipped forever. Now the key is
    // released on failure. If Redis itself is down we still process —
    // plan updates are idempotent.
    const redis = getRedis();
    const idempotencyKey = KEYS.webhookEvent(event.id);
    let claimed = true;
    try {
      claimed = !!(await redis.set(idempotencyKey, '1', 'NX', 'EX', TTL.ONE_WEEK));
    } catch (err) {
      logger.warn('Webhook idempotency check unavailable, processing anyway', { error: err.message });
    }

    if (!claimed) {
      logger.info(`Webhook event ${event.id} already processed. Skipping.`);
      return res.json({ received: true });
    }

    try {
      const subscriptionEvents = [
        'customer.subscription.updated',
        'customer.subscription.created',
        'customer.subscription.deleted',
      ];

      if (subscriptionEvents.includes(event.type)) {
        const subscription = event.data.object;
        const customerId = subscription.customer;
        const status = event.type === 'customer.subscription.deleted' ? 'canceled' : subscription.status;
        const priceId = subscription.items?.data?.[0]?.price?.id || null;

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
          await UserModel.updateStripeSubscription(userId, subscription.id, status, priceId);
          // FIX: cancellations now also revoke paid-tier API grants.
          await applyPlanChange(userId, plan);
          logger.info('Stripe subscription synced', { userId, plan, status });
        } else {
          logger.warn(`Stripe webhook: User not found for customer ${customerId}`);
        }
      }

      res.json({ received: true });
    } catch (err) {
      await redis.del(idempotencyKey).catch(() => {});
      logger.error('Webhook error', { error: err.message, stack: err.stack });
      res.status(500).send('Webhook Error: Internal failure');
    }
  },
};

module.exports = UserController;