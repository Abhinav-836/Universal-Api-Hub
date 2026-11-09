// backend/src/services/llm.service.js
const axios = require('axios');
const logger = require('../utils/logger');
const { currentBilling } = require('../utils/billingContext');

const getBaseUrl = () =>
  (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '');

const getApiKey = () => process.env.OPENROUTER_API_KEY || '';

const hasRealKey = (key) =>
  !!key && !/placeholder|x{4,}/i.test(key);

const splitModels = (value) => value.split(',').map((m) => m.trim()).filter(Boolean);

// Model ids change often on OpenRouter — set these in .env and check
// https://openrouter.ai/models when a model starts returning 404.
const getModelsForPlan = (plan = 'free') => {
  const modelsMap = {
    free: process.env.OPENROUTER_MODEL_FREE || 'meta-llama/llama-3.3-70b-instruct:free',
    pro: process.env.OPENROUTER_MODEL_PRO || 'openai/gpt-4o-mini',
    premium: process.env.OPENROUTER_MODEL_ALL || 'openai/gpt-4o',
  };
  return splitModels(modelsMap[plan] || modelsMap.free);
};

// Image analysis needs a model that accepts images. Same idea: comma-separated,
// tried in order.
// Users without paid time get OPENROUTER_MODEL_VISION_FREE (e.g. a ":free"
// vision model); if that isn't set, image analysis needs a paid plan.
const getVisionModels = (plan = 'premium') =>
  plan === 'free'
    ? splitModels(process.env.OPENROUTER_MODEL_VISION_FREE || '')
    : splitModels(process.env.OPENROUTER_MODEL_VISION || 'openai/gpt-4o-mini');

const getPrimaryModel = (plan = 'free') => getModelsForPlan(plan)[0];

const mockReply = (message, plan) => ({
  source: 'mock',
  reply: `[Mock] ${message.slice(0, 160)}`,
  model: 'mock-llm-chat',
  usage: null,
  finishReason: 'stop',
  plan,
  availableModels: getModelsForPlan(plan),
});

const unavailable = (code) => {
  const err = new Error('The AI provider is temporarily unavailable. Please retry shortly.');
  err.statusCode = 503;
  if (code) err.code = code;
  return err;
};

// 400/404 from OpenRouter usually means "this model id is gone/invalid" (or,
// for images, "this model couldn't read the input") — worth trying the next
// model in the list.
const isModelError = (err) => [400, 404].includes(err.response?.status);

async function callOpenRouter({ model, messages, temperature, maxTokens }) {
  const response = await axios.post(
    `${getBaseUrl()}/chat/completions`,
    { model, temperature, max_tokens: maxTokens, messages },
    {
      headers: {
        Authorization: `Bearer ${getApiKey()}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.FRONTEND_URL || 'https://universal-api-hub.vercel.app',
        'X-Title': 'Universal API Hub',
      },
      timeout: 45000,
    }
  );
  return response.data;
}

/**
 * Pull a JSON object out of a model reply. Models sometimes wrap JSON in
 * ```json fences or add a sentence before it, so we look for the outermost
 * { ... } rather than trusting the whole string.
 */
function parseJsonReply(text) {
  if (typeof text !== 'string') return null;
  const cleaned = text.replace(/```(?:json)?/gi, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

const LlmService = {
  /** True when a real OpenRouter key is configured (otherwise endpoints run in demo mode). */
  isConfigured: () => hasRealKey(getApiKey()),

  /**
   * Send a list of chat messages, trying each model in order.
   * Moves to the next model on 400/404 (bad or retired model id); any other
   * failure is a 503 straight away. If every model rejected the request, the
   * error has code 'ALL_MODELS_REJECTED' so callers can tell "the input was
   * unreadable" apart from "the provider is down".
   */
  complete: async ({ messages, models, temperature = 0.2, maxTokens = 500, logContext = {} }) => {
    if (!hasRealKey(getApiKey())) {
      const err = new Error('OpenRouter is not configured');
      err.statusCode = 503;
      err.code = 'NOT_CONFIGURED';
      throw err;
    }

    let rejected = 0;
    for (const model of models) {
      try {
        const data = await callOpenRouter({ model, messages, temperature, maxTokens });
        const choice = data.choices?.[0];
        if (!choice?.message) throw unavailable();
        // Paid models: charge the caller's wallet what OpenRouter charged us
        // (usage.cost, always present) — see wallet.service.js.
        const billing = currentBilling();
        const costUsd = Number(data.usage?.cost || 0);
        if (billing?.userId && costUsd > 0) {
          const Wallet = require('./wallet.service');
          billing.chargedPaise += await Wallet.chargeAiCall({
            userId: billing.userId, costUsd, model: data.model || model, endpoint: billing.endpoint,
          });
        }
        return {
          source: 'openrouter',
          reply: choice.message.content || '',
          model: data.model || model,
          usage: data.usage || null,
          finishReason: choice.finish_reason || 'stop',
        };
      } catch (err) {
        logger.error('OpenRouter request failed', {
          ...logContext,
          error: err.message,
          model,
          status: err.response?.status,
          data: err.response?.data,
        });
        if (isModelError(err)) {
          rejected += 1;
          continue;
        }
        throw unavailable();
      }
    }

    throw unavailable(rejected === models.length ? 'ALL_MODELS_REJECTED' : undefined);
  },

  /**
   * Same as complete(), but the reply must be a JSON object. Throws a 503 if
   * the model returns something that isn't valid JSON, so callers never pass
   * half-parsed output to users.
   */
  completeJson: async (options) => {
    const result = await LlmService.complete(options);
    const json = parseJsonReply(result.reply);
    if (!json) {
      logger.error('OpenRouter returned non-JSON output', { ...options.logContext, model: result.model });
      const err = new Error('The AI provider returned an unreadable response. Please retry.');
      err.statusCode = 503;
      throw err;
    }
    return { ...result, json };
  },

  /**
   * Returns { source: 'mock' } ONLY when no API key is configured.
   * FIX: provider failures used to come back as "[Mock] ..." with HTTP 200
   * and the user was charged. They now throw a 503 (and quota is refunded).
   */
  chat: async ({ message, system, temperature = 0.4, maxTokens = 500, plan = 'free', model: requestedModel }) => {
    const availableModels = getModelsForPlan(plan);

    if (!hasRealKey(getApiKey())) {
      logger.warn('No valid OpenRouter API key, using mock response');
      return mockReply(message, plan);
    }

    const ordered = requestedModel && availableModels.includes(requestedModel)
      ? [requestedModel, ...availableModels.filter((m) => m !== requestedModel)]
      : availableModels;

    const result = await LlmService.complete({
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        { role: 'user', content: message },
      ],
      models: ordered,
      temperature,
      maxTokens,
      logContext: { plan },
    });
    return { ...result, availableModels, plan };
  },

  getAvailableModels: (plan = 'free') => getModelsForPlan(plan),
  getVisionModels: (plan) => getVisionModels(plan),
  getPrimaryModel: (plan = 'free') => getPrimaryModel(plan),
  parseJsonReply,
};

module.exports = LlmService;