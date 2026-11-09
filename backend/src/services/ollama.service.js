// backend/src/services/ollama.service.js
//
// Ollama Cloud as a backup AI provider, used only when every OpenRouter model
// in the list has failed (rate limit, empty balance, outage, retired model).
//
// Ollama Cloud is pay-per-token (https://ollama.com/pricing) and its reply
// has token counts but no price, so the cost is worked out here from the
// price table below (USD per million tokens, from that page; update it if
// Ollama changes prices).
//
// Who pays:
//   - customers with AI credits: their wallet, the same way as OpenRouter;
//   - everyone else: the site owner's Ollama account, but only up to
//     OLLAMA_FREE_DAILY_USD a day (default $0.25), then Ollama is skipped.
//
// Env: OLLAMA_API_KEY (required to enable), OLLAMA_MODELS, OLLAMA_VISION_MODELS,
//      OLLAMA_BASE_URL (default https://ollama.com), OLLAMA_FREE_DAILY_USD.
const axios = require('axios');
const logger = require('../utils/logger');
const { getRedis } = require('../config/redis');

const PRICES = {
  // model: [input, output] USD per million tokens
  'gpt-oss:20b': [0.07, 0.3],
  'gpt-oss:120b': [0.15, 0.6],
  'gemma4:31b': [0.14, 0.4],
  'mimo-v2.6-flash': [0.14, 0.28],
  'glm-5.3-flash': [0.15, 0.5],
  'minimax-m3.1-flash': [0.15, 0.6],
  'deepseek-v4.1-flash': [0.3, 1.2],
  'nemotron-3-super': [0.015, 0.6],
  'mistral-large-4': [0.7, 2.1],
  'kimi-k2.6': [0.95, 4.0],
};
// Unknown model: assume an expensive one, so nobody is under-charged.
const FALLBACK_PRICE = [3.0, 15.0];

const split = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);
const apiKey = () => process.env.OLLAMA_API_KEY || '';
const baseUrl = () => (process.env.OLLAMA_BASE_URL || 'https://ollama.com').replace(/\/$/, '');

const isConfigured = () => apiKey().length >= 20;
const textModels = () => split(process.env.OLLAMA_MODELS || 'gpt-oss:120b,mimo-v2.6-flash,gemma4:31b');
const visionModels = () => split(process.env.OLLAMA_VISION_MODELS || 'gemma4:31b,mimo-v2.6-flash');

function costUsd(model, usage) {
  const [pin, pout] = PRICES[String(model).replace(/-cloud$/, '')] || FALLBACK_PRICE;
  const tin = Number(usage?.prompt_tokens || 0);
  const tout = Number(usage?.completion_tokens || 0);
  return (tin * pin + tout * pout) / 1e6;
}

const hasImages = (messages) =>
  (messages || []).some((m) => Array.isArray(m.content) && m.content.some((c) => c?.type === 'image_url'));

// ── The owner's daily budget for non-paying use (Redis; fails closed) ──
const dayKey = () => `ollama:free_spend:${new Date().toISOString().slice(0, 10)}`;
const freeBudgetUsd = () => {
  const n = Number(process.env.OLLAMA_FREE_DAILY_USD);
  return Number.isFinite(n) && n >= 0 ? n : 0.25;
};
async function freeBudgetLeft() {
  try {
    const spentMicro = Number((await getRedis().get(dayKey())) || 0);
    return freeBudgetUsd() - spentMicro / 1e6;
  } catch {
    return 0; // can't check the budget → don't spend the owner's money
  }
}
async function recordFreeSpend(usd) {
  try {
    const r = getRedis();
    await r.incrby(dayKey(), Math.ceil(usd * 1e6));
    await r.expire(dayKey(), 2 * 24 * 3600);
  } catch (err) {
    logger.warn('Could not record Ollama spend', { error: err.message });
  }
}

/**
 * Try the Ollama models in order. Returns { reply, model, usage, costUsd,
 * finishReason } or null if Ollama is off, over budget, or every model failed.
 * `paying` = the caller's wallet will be charged (no daily owner budget then).
 */
async function complete({ messages, temperature, maxTokens, paying, logContext = {} }) {
  if (!isConfigured()) return null;
  if (!paying && (await freeBudgetLeft()) <= 0) {
    logger.warn('Ollama backup skipped: daily free budget used up', logContext);
    return null;
  }
  const models = hasImages(messages) ? visionModels() : textModels();
  for (const model of models) {
    try {
      const { data } = await axios.post(
        `${baseUrl()}/v1/chat/completions`,
        { model, messages, temperature, max_tokens: maxTokens, stream: false },
        { headers: { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json' }, timeout: 60000 }
      );
      const choice = data?.choices?.[0];
      if (!choice?.message) continue;
      const usd = costUsd(model, data.usage);
      if (!paying && usd > 0) await recordFreeSpend(usd);
      return {
        reply: choice.message.content || '',
        model: `ollama/${data.model || model}`,
        usage: data.usage || null,
        costUsd: usd,
        finishReason: choice.finish_reason || 'stop',
      };
    } catch (err) {
      logger.error('Ollama request failed', { ...logContext, model, status: err.response?.status, error: err.message });
    }
  }
  return null;
}

module.exports = { isConfigured, complete, costUsd, hasImages, PRICES, _freeBudgetLeft: freeBudgetLeft };
