// backend/src/services/billing.service.js
//
// Paid plans through Razorpay. Each payment buys PLAN_DAYS (30) days of a
// plan; paying again for the same plan before it ends adds 30 more days.
// When the time runs out, expirePlans() moves the user back to free.
//
// A payment only counts after BOTH of these:
//   1. the signature from Checkout matches (proves the browser didn't make it up), and
//   2. Razorpay's own API says that payment is captured, for this order, for
//      exactly the amount we asked for.
// The webhook (payment.captured / order.paid) runs the same confirm step, so
// a user who closes the tab right after paying still gets their plan.
//
// Paying twice is blocked at both ends:
//   - start: clicking "Pay" again hands back the same open order (openOrder),
//     and Razorpay takes only one payment per order;
//   - finish: confirmPayment grants the plan / credits exactly once per order,
//     however many times the browser and webhook call it.
const crypto = require('crypto');
const db = require('../config/db');
const Razorpay = require('./razorpay.service');
const { applyPlanChange, invalidateUserCaches } = require('./plan.service');
const ApiModel = require('../models/api.model');
const Wallet = require('./wallet.service');
const { PLANS } = require('../utils/constants');
const logger = require('../utils/logger');

const PLAN_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const PAID_PLANS = ['pro', 'premium'];
// payments.plan = 'credits' marks a wallet top-up rather than a plan purchase.
const CREDITS = 'credits';
const TOPUP_MIN_INR = 50;
const TOPUP_MAX_INR = 10000;

const httpError = (statusCode, message, extra = {}) => Object.assign(new Error(message), { statusCode, ...extra });

/** Price in rupees for 30 days. Set PRICE_PRO_INR / PRICE_PREMIUM_INR to change them. */
function priceInr(plan) {
  const fromEnv = Number(process.env[`PRICE_${plan.toUpperCase()}_INR`]);
  if (Number.isFinite(fromEnv) && fromEnv >= 1) return Math.round(fromEnv);
  return { pro: 199, premium: 499 }[plan];
}

const prices = () => ({ pro: priceInr('pro'), premium: priceInr('premium') });

// How long an unpaid order is handed out again instead of making a new one.
const REUSE_ORDER_MINUTES = 30;

/**
 * Get the Razorpay order for this purchase — the SAME order every time.
 *
 * Without this, every click on "Pay" made a new order, so a double click,
 * a second tab, or "close the window and try again" while a UPI payment was
 * still pending could charge the customer twice. Razorpay accepts only one
 * successful payment per order, so handing back the open order makes a
 * second charge impossible.
 *
 * A per-user database lock makes two clicks that arrive at the same moment
 * wait for each other instead of both creating an order.
 */
async function openOrder(user, { kind, amount, receiptPrefix, notes }) {
  const result = await db.withTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`uah_pay:${user.id}`]);

    const { rows } = await client.query(
      `SELECT order_id FROM payments
       WHERE user_id = $1 AND plan = $2 AND amount = $3 AND status = 'created'
         AND created_at > NOW() - make_interval(mins => $4)
       ORDER BY created_at DESC LIMIT 1`,
      [user.id, kind, amount, REUSE_ORDER_MINUTES]
    );
    if (rows[0]) return { orderId: rows[0].order_id, reused: true };

    let order;
    try {
      order = await Razorpay.createOrder({
        amount,
        currency: 'INR',
        receipt: `${receiptPrefix}${crypto.randomBytes(8).toString('hex')}`,
        notes: { userId: user.id, ...notes },
      });
    } catch (err) {
      logger.error('Razorpay order failed', { status: err.response?.status, error: err.response?.data?.error?.description || err.message });
      throw httpError(502, 'Could not start the payment. Please try again.');
    }
    await client.query(
      `INSERT INTO payments (user_id, plan, amount, currency, order_id, status)
       VALUES ($1, $2, $3, 'INR', $4, 'created')`,
      [user.id, kind, amount, order.id]
    );
    return { orderId: order.id, reused: false };
  });

  // An order we hand out again may already be paid at Razorpay while our
  // confirm step hasn't run yet (closed tab, slow UPI, late webhook). Finish
  // that payment now and tell the customer, instead of asking them to pay again.
  if (result.reused) {
    let order = null;
    try {
      order = await Razorpay.fetchOrder(result.orderId);
    } catch (err) {
      // Can't check right now. Reusing is still safe: Razorpay refuses a
      // second payment on an order that is already paid.
      logger.warn('Could not check reused Razorpay order', { orderId: result.orderId, status: err.response?.status });
    }
    if (order?.status === 'paid') {
      const items = await Razorpay.fetchOrderPayments(result.orderId).catch(() => []);
      const captured = items.find((p) => p.status === 'captured');
      if (captured) await confirmPayment({ orderId: result.orderId, paymentId: captured.id }).catch(() => {});
      throw httpError(409, 'Your earlier payment for this already went through. Refresh the page to see it.', { alreadyPaid: true });
    }
  }
  return result.orderId;
}

async function createCheckout(user, plan) {
  if (!PAID_PLANS.includes(plan)) throw httpError(400, 'Choose the pro or premium plan.');
  if (!Razorpay.isConfigured()) throw httpError(501, 'Payments are not set up yet.');

  const amount = priceInr(plan) * 100; // paise
  const orderId = await openOrder(user, { kind: plan, amount, receiptPrefix: 'uah_', notes: { plan } });

  return {
    orderId,
    amount,
    currency: 'INR',
    keyId: Razorpay.publicKeyId(),
    plan,
    days: PLAN_DAYS,
    name: 'Universal API Hub',
    description: `${PLANS[plan].name} plan — ${PLAN_DAYS} days`,
    prefill: { email: user.email },
    testMode: Razorpay.isTestMode(),
  };
}

/** Start a wallet top-up of `amountInr` rupees (whole rupees, 50–10,000). */
async function createTopup(user, amountInr) {
  const rupees = Number(amountInr);
  if (!Number.isInteger(rupees) || rupees < TOPUP_MIN_INR || rupees > TOPUP_MAX_INR) {
    throw httpError(400, `Add between ₹${TOPUP_MIN_INR} and ₹${TOPUP_MAX_INR.toLocaleString('en-IN')} in whole rupees.`);
  }
  if (!Razorpay.isConfigured()) throw httpError(501, 'Payments are not set up yet.');
  const amount = rupees * 100;
  const orderId = await openOrder(user, { kind: CREDITS, amount, receiptPrefix: 'uah_c_', notes: { kind: CREDITS } });
  return {
    orderId,
    amount,
    currency: 'INR',
    keyId: Razorpay.publicKeyId(),
    kind: CREDITS,
    name: 'Universal API Hub',
    description: `AI credits ₹${rupees}`,
    prefill: { email: user.email },
    testMode: Razorpay.isTestMode(),
  };
}

/**
 * Mark the order paid and give the plan — once. Safe to call from both the
 * browser callback and the webhook, in any order, any number of times.
 * `forUserId` (browser path) makes sure people can only confirm their own order.
 */
async function confirmPayment({ orderId, paymentId, forUserId = null }) {
  const { rows } = await db.query('SELECT * FROM payments WHERE order_id = $1', [orderId]);
  const row = rows[0];
  if (!row) throw httpError(404, 'Payment not found.');
  if (forUserId && row.user_id !== forUserId) throw httpError(404, 'Payment not found.');
  if (row.status === 'paid') return { alreadyPaid: true, plan: row.plan, userId: row.user_id };

  let payment;
  try {
    payment = await Razorpay.fetchPayment(paymentId);
    if (payment.status === 'authorized') {
      payment = await Razorpay.capturePayment(paymentId, row.amount, row.currency);
    }
  } catch (err) {
    logger.error('Razorpay payment lookup failed', { orderId, status: err.response?.status });
    throw httpError(502, 'Could not confirm the payment with Razorpay. If money was taken, your plan will update within a few minutes.');
  }

  if (payment.order_id !== orderId || Number(payment.amount) !== Number(row.amount) || payment.currency !== row.currency) {
    logger.warn('Razorpay payment does not match the order', { orderId, paymentId });
    throw httpError(400, 'This payment does not match the order.');
  }
  if (payment.status !== 'captured') {
    throw httpError(402, 'The payment has not gone through.');
  }

  // Claim the order atomically: only one caller gets to grant the plan.
  return db.withTransaction(async (client) => {
    const claimed = await client.query(
      `UPDATE payments SET status = 'paid', payment_id = $2, paid_at = NOW()
       WHERE order_id = $1 AND status <> 'paid' RETURNING *`,
      [orderId, paymentId]
    );
    if (!claimed.rows[0]) return { alreadyPaid: true, plan: row.plan, userId: row.user_id };
    if (!row.user_id) return { alreadyPaid: false, plan: row.plan, userId: null }; // account deleted

    if (row.plan === CREDITS) {
      const balance = await Wallet.credit(row.user_id, Number(row.amount), { kind: 'topup', ref: orderId }, client);
      return { alreadyPaid: false, kind: CREDITS, creditedPaise: Number(row.amount), balancePaise: balance, userId: row.user_id };
    }

    const { rows: users } = await client.query(
      'SELECT plan, plan_expires_at FROM users WHERE id = $1 FOR UPDATE',
      [row.user_id]
    );
    const u = users[0];
    const now = Date.now();
    const current = u?.plan_expires_at ? new Date(u.plan_expires_at).getTime() : 0;
    // Same plan still running → add 30 days on top. Otherwise start today.
    const start = u && u.plan === row.plan && current > now ? current : now;
    const expiresAt = new Date(start + PLAN_DAYS * DAY_MS);

    await client.query(
      'UPDATE users SET plan = $1, plan_expires_at = $2, updated_at = NOW() WHERE id = $3',
      [row.plan, expiresAt, row.user_id]
    );
    return { alreadyPaid: false, plan: row.plan, userId: row.user_id, expiresAt };
  }).then(async (result) => {
    if (result.kind === CREDITS) {
      logger.info('Wallet topped up', { userId: result.userId, paise: result.creditedPaise, orderId });
      return result;
    }
    if (result.userId && !result.alreadyPaid) {
      await ApiModel.syncAccessForPlan(result.userId, result.plan, PLANS[result.plan]?.apiSlots);
      await invalidateUserCaches(result.userId);
      logger.info('Plan paid', { userId: result.userId, plan: result.plan, orderId });
    }
    return result;
  });
}

/** Browser callback after Checkout succeeds. */
async function verifyCheckout(user, { orderId, paymentId, signature }) {
  if (!Razorpay.verifyCheckoutSignature(orderId, paymentId, signature)) {
    throw httpError(400, 'Payment verification failed.');
  }
  return confirmPayment({ orderId, paymentId, forUserId: user.id });
}

/** Razorpay webhook. Returns true if the event was handled or safely ignored. */
async function handleWebhook(event) {
  const type = event?.event;
  if (type !== 'payment.captured' && type !== 'order.paid') return true;
  const p = event?.payload?.payment?.entity;
  if (!p?.order_id || !p?.id) return true;
  try {
    await confirmPayment({ orderId: p.order_id, paymentId: p.id });
  } catch (err) {
    if (err.statusCode === 404) return true; // not one of our orders
    throw err;
  }
  return true;
}

/** Move users whose paid time has run out back to the free plan. */
async function expirePlans() {
  const { rows } = await db.query(
    `SELECT id FROM users
     WHERE plan <> 'free' AND plan_expires_at IS NOT NULL AND plan_expires_at < NOW()`
  );
  for (const { id } of rows) {
    try {
      await applyPlanChange(id, 'free', null);
      logger.info('Paid plan expired', { userId: id });
    } catch (err) {
      logger.error('Could not expire plan', { userId: id, error: err.message });
    }
  }
  return rows.length;
}

module.exports = { PLAN_DAYS, TOPUP_MIN_INR, TOPUP_MAX_INR, priceInr, prices, createCheckout, createTopup, verifyCheckout, confirmPayment, handleWebhook, expirePlans };