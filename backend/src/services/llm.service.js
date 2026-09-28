// backend/src/services/llm.service.js
const axios = require('axios');
const logger = require('../utils/logger');

const getBaseUrl = () =>
  (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '');

const getApiKey = () => process.env.OPENROUTER_API_KEY || '';

const getModelsForPlan = (plan = 'free') => {
  const modelsMap = {
    free: process.env.OPENROUTER_MODEL_FREE || 'google/gemini-2.0-flash-exp:free',
    pro: process.env.OPENROUTER_MODEL_PRO || 'openai/gpt-4o-mini',
    premium: process.env.OPENROUTER_MODEL_ALL || 'openai/gpt-4o,anthropic/claude-3.5-sonnet',
  };

  const models = modelsMap[plan] || modelsMap.free;
  return models.split(',').map(m => m.trim()).filter(Boolean);
};

const getPrimaryModel = (plan = 'free') => {
  const models = getModelsForPlan(plan);
  return models.length > 0 ? models[0] : 'openai/gpt-3.5-turbo';
};

const mockReply = (message) => ({
  source: 'mock',
  reply: `[Mock] ${message.slice(0, 160)}`,
  model: 'mock-llm-chat',
  usage: {
    prompt_tokens: Math.max(1, Math.round(message.length / 4)),
    completion_tokens: 96,
    total_tokens: Math.max(1, Math.round(message.length / 4)) + 96,
  },
});

const LlmService = {
  chat: async ({ message, system, temperature = 0.4, maxTokens = 500, plan = 'free', model: requestedModel }) => {
    const apiKey = getApiKey();
    const baseUrl = getBaseUrl();
    const availableModels = getModelsForPlan(plan);

    // FIX: allow user to pass a specific model but only if it's in their plan's allowed list
    let model = requestedModel && availableModels.includes(requestedModel)
      ? requestedModel
      : getPrimaryModel(plan);

    logger.debug('LLM request', { model, plan, hasApiKey: !!apiKey });

    if (!apiKey || apiKey === 'sk-or-v1-placeholder_replace_with_real_key' || apiKey.includes('xxxxx')) {
      logger.warn('No valid OpenRouter API key, using mock response');
      return mockReply(message);
    }

    try {
      const response = await axios.post(
        `${baseUrl}/chat/completions`,
        {
          model: model,
          temperature,
          max_tokens: maxTokens,
          messages: [
            ...(system ? [{ role: 'system', content: system }] : []),
            { role: 'user', content: message },
          ],
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.FRONTEND_URL || 'https://universal-api-hub.com',
            'X-Title': 'Universal API Hub',
          },
          timeout: 30000,
        }
      );

      const choice = response.data.choices?.[0];
      return {
        source: 'openrouter',
        reply: choice?.message?.content || '',
        model: response.data.model || model,
        usage: response.data.usage || null,
        finishReason: choice?.finish_reason || 'stop',
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

      // Fallback to a known working model if the requested one 404s
      if (err.response?.status === 404) {
        try {
          const fallbackModel = 'google/gemini-2.0-flash-exp:free';
          const fallbackResponse = await axios.post(
            `${baseUrl}/chat/completions`,
            {
              model: fallbackModel,
              temperature,
              max_tokens: maxTokens,
              messages: [
                ...(system ? [{ role: 'system', content: system }] : []),
                { role: 'user', content: message },
              ],
            },
            {
              headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': process.env.FRONTEND_URL || 'https://universal-api-hub.com',
                'X-Title': 'Universal API Hub',
              },
              timeout: 30000,
            }
          );
          const choice = fallbackResponse.data.choices?.[0];
          return {
            source: 'openrouter-fallback',
            reply: choice?.message?.content || '',
            model: fallbackModel,
            usage: fallbackResponse.data.usage || null,
            finishReason: choice?.finish_reason || 'stop',
            availableModels: [fallbackModel],
            plan,
          };
        } catch (fallbackErr) {
          logger.error('Fallback LLM also failed', { error: fallbackErr.message });
        }
      }

      return {
        ...mockReply(message),
        source: 'mock-fallback',
        plan,
        error: err.message,
        availableModels,
      };
    }
  },

  getAvailableModels: (plan = 'free') => getModelsForPlan(plan),
  getPrimaryModel: (plan = 'free') => getPrimaryModel(plan),
};

module.exports = LlmService;