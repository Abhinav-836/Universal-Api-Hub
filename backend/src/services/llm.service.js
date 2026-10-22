// backend/src/services/llm.service.js
const axios = require('axios');
const logger = require('../utils/logger');

const getBaseUrl = () =>
  (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '');

const getApiKey = () => process.env.OPENROUTER_API_KEY || '';

const hasRealKey = (key) =>
  !!key && !/placeholder|x{4,}/i.test(key);

// Model ids change often on OpenRouter — set these in .env and check
// https://openrouter.ai/models when a model starts returning 404.
const getModelsForPlan = (plan = 'free') => {
  const modelsMap = {
    free: process.env.OPENROUTER_MODEL_FREE || 'meta-llama/llama-3.3-70b-instruct:free',
    pro: process.env.OPENROUTER_MODEL_PRO || 'openai/gpt-4o-mini',
    premium: process.env.OPENROUTER_MODEL_ALL || 'openai/gpt-4o',
  };
  const models = modelsMap[plan] || modelsMap.free;
  return models.split(',').map((m) => m.trim()).filter(Boolean);
};

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

const unavailable = () => {
  const err = new Error('The AI provider is temporarily unavailable. Please retry shortly.');
  err.statusCode = 503;
  return err;
};

// 400/404 from OpenRouter usually means "this model id is gone/invalid" —
// worth trying the next model in the plan's list.
const isModelError = (err) => [400, 404].includes(err.response?.status);

async function callOpenRouter({ model, message, system, temperature, maxTokens }) {
  const response = await axios.post(
    `${getBaseUrl()}/chat/completions`,
    {
      model,
      temperature,
      max_tokens: maxTokens,
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        { role: 'user', content: message },
      ],
    },
    {
      headers: {
        Authorization: `Bearer ${getApiKey()}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.FRONTEND_URL || 'https://universal-api-hub.vercel.app',
        'X-Title': 'Universal API Hub',
      },
      timeout: 30000,
    }
  );
  return response.data;
}

const LlmService = {
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

    for (const model of ordered) {
      try {
        const data = await callOpenRouter({ model, message, system, temperature, maxTokens });
        const choice = data.choices?.[0];
        if (!choice?.message) throw unavailable();
        return {
          source: 'openrouter',
          reply: choice.message.content || '',
          model: data.model || model,
          usage: data.usage || null,
          finishReason: choice.finish_reason || 'stop',
          availableModels,
          plan,
        };
      } catch (err) {
        logger.error('OpenRouter request failed', {
          error: err.message,
          model,
          plan,
          status: err.response?.status,
          data: err.response?.data,
        });
        if (isModelError(err)) continue; // try the next configured model
        throw unavailable();
      }
    }

    throw unavailable();
  },

  getAvailableModels: (plan = 'free') => getModelsForPlan(plan),
  getPrimaryModel: (plan = 'free') => getPrimaryModel(plan),
};

module.exports = LlmService;