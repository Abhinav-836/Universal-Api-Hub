// backend/src/services/wallet.service.js
//
// Prepaid AI credits ("wallet"), stored in paise.
//
//  - Customers top up through Razorpay (billing.service → credit()).
//  - Paid AI models run only while the balance is at least WALLET_MIN_INR.
//  - After each paid AI call, OpenRouter reports what it cost (usage.cost, in
//    US dollars). We charge that × AI_USD_INR × AI_MARGIN, rounded up to the
//    paise. The site owner keeps OpenRouter topped up from these payments.
//  - Free models cost 0 and are never charged.
//
// Every change is written to wallet_transactions with the balance after it,
// so each user's history adds up exactly.
const db = require('../config/db');
const logger = require('../utils/logger');

const num = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
const usdToInr = () => num(process.env.AI_USD_INR, 90);
const margin = () => num(process.env.AI_MARGIN, 1.25);
const minBalancePaise = () => Math.round(num(process.env.WALLET_MIN_INR, 2) * 100);

/** What a call that cost `costUsd` on OpenRouter costs the customer, in paise. */
const priceForUsd = (costUsd) => {
  const c = Number(costUsd);
  if (!Number.isFinite(c) || c <= 0) return 0;
  return Math.max(1, Math.ceil(c * usdToInr() * margin() * 100));
};

async function balance(userId) {
  const { rows } = await db.query('SELECT credit_paise FROM users WHERE id = $1', [userId]);
  return Number(rows[0]?.credit_paise || 0);
}

/**
 * Which plan's AI models to use for this request. Paid models need money in
 * the wallet; with too little, everyone gets the free models (plan 'free').
 */
async function aiPlanFor(user) {
  if (!user?.id || !user.plan || user.plan === 'free') return 'free';
  try {
    return (await balance(user.id)) >= minBalancePaise() ? user.plan : 'free';
  } catch (err) {
    logger.warn('Wallet balance check failed, using free models', { error: err.message });
    return 'free';
  }
}

/** Add credits (top-up or refund). Pass a transaction client to join an outer transaction. */
async function credit(userId, paise, { kind = 'topup', ref = null } = {}, client = db) {
  const { rows } = await client.query(
    'UPDATE users SET credit_paise = credit_paise + $2, updated_at = NOW() WHERE id = $1 RETURNING credit_paise',
    [userId, paise]
  );
  const after = Number(rows[0]?.credit_paise || 0);
  await client.query(
    `INSERT INTO wallet_transactions (user_id, amount_paise, kind, ref, balance_after)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, paise, kind, ref, after]
  );
  return after;
}

/**
 * Charge one AI call. The call has already happened, so this never throws:
 * a failure is logged and the call stays free. The balance may go a little
 * below zero on the last call; the next paid call is then refused.
 */
async function chargeAiCall({ userId, costUsd, model, endpoint }) {
  const paise = priceForUsd(costUsd);
  if (!userId || paise === 0) return 0;
  try {
    await db.withTransaction(async (client) => {
      const { rows } = await client.query(
        'UPDATE users SET credit_paise = credit_paise - $2 WHERE id = $1 RETURNING credit_paise',
        [userId, paise]
      );
      if (!rows[0]) return;
      await client.query(
        `INSERT INTO wallet_transactions (user_id, amount_paise, kind, ref, model, cost_usd, balance_after)
         VALUES ($1, $2, 'ai_usage', $3, $4, $5, $6)`,
        [userId, -paise, endpoint || null, model || null, Number(costUsd), Number(rows[0].credit_paise)]
      );
    });
    return paise;
  } catch (err) {
    logger.error('Wallet charge failed', { userId, paise, error: err.message });
    return 0;
  }
}

async function history(userId, limit = 20) {
  const { rows } = await db.query(
    `SELECT amount_paise, kind, ref, model, balance_after, created_at
     FROM wallet_transactions WHERE user_id = $1
     ORDER BY created_at DESC LIMIT $2`,
    [userId, Math.min(100, Math.max(1, limit))]
  );
  return rows.map((r) => ({ ...r, amount_paise: Number(r.amount_paise), balance_after: Number(r.balance_after) }));
}

module.exports = {
  usdToInr,
  margin,
  minBalancePaise,
  priceForUsd,
  balance,
  aiPlanFor,
  credit,
  chargeAiCall,
  history,
};
