// backend/src/services/llm.service.js
const axios = require('axios');
const logger = require('../utils/logger');

const getBaseUrl = () =>
  (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '');

const getApiKey = () => process.env.OPENROUTER_API_KEY || '';

// Get models based on plan
const getModelsForPlan = (plan = 'free') => {
  const modelsMap = {
    free: process.env.OPENROUTER_MODEL_FREE || 'google/gemini-2.0-flash-exp:free',
    pro: process.env.OPENROUTER_MODEL_PRO || 'openai/gpt-4o-2024-11-20',
    premium: process.env.OPENROUTER_MODEL_ALL || 'openai/gpt-4o-2024-11-20,anthropic/claude-3.5-sonnet-20240620',
  };
  
  const models = modelsMap[plan] || modelsMap.free;
  return models.split(',').map(m => m.trim()).filter(Boolean);
};

// Get primary model for a plan
const getPrimaryModel = (plan = 'free') => {
  const models = getModelsForPlan(plan);
  return models.length > 0 ? models[0] : 'openai/gpt-3.5-turbo';
};

// Mock fallback (only if API completely fails)
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
  chat: async ({ message, system, temperature = 0.4, maxTokens = 500, plan = 'free' }) => {
    const apiKey = getApiKey();
    const baseUrl = getBaseUrl();
    const model = getPrimaryModel(plan);
    const availableModels = getModelsForPlan(plan);

    console.log('🔑 API Key loaded:', apiKey ? '✅ Yes' : '❌ No');
    console.log('📡 Base URL:', baseUrl);
    console.log('🤖 Model:', model);
    console.log('📋 Plan:', plan);

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
          // Add this to help with model availability
          ...(model.includes(':free') ? { // For free models
            extra_body: {
              provider: { order: ['OpenRouter', 'Together', 'Azure'] }
            }
          } : {}),
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://universal-api-hub.com',
            'X-Title': 'Universal API Hub',
          },
          timeout: 15000,
        }
      );

      const choice = response.data.choices?.[0];
      const result = {
        source: 'openrouter',
        reply: choice?.message?.content || '',
        model: response.data.model || model,
        usage: response.data.usage || null,
        finishReason: choice?.finish_reason || 'stop',
        availableModels: availableModels,
        plan: plan,
      };

      console.log('✅ OpenRouter response received!');
      return result;
    } catch (err) {
      console.error('❌ OpenRouter error:', err.message);
      logger.error('OpenRouter request failed', { 
        error: err.message,
        model: model,
        plan: plan,
        status: err.response?.status,
        data: err.response?.data
      });
      
      // If model not found, try fallback to a known working model
      if (err.response?.status === 404 && model.includes('mistralai')) {
        console.log('🔄 Trying fallback model: google/gemini-2.0-flash-exp:free');
        try {
          const fallbackResponse = await axios.post(
            `${baseUrl}/chat/completions`,
            {
              model: 'google/gemini-2.0-flash-exp:free',
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
                'HTTP-Referer': 'https://universal-api-hub.com',
                'X-Title': 'Universal API Hub',
              },
              timeout: 15000,
            }
          );
          const choice = fallbackResponse.data.choices?.[0];
          return {
            source: 'openrouter-fallback',
            reply: choice?.message?.content || '',
            model: 'google/gemini-2.0-flash-exp:free',
            usage: fallbackResponse.data.usage || null,
            finishReason: choice?.finish_reason || 'stop',
            availableModels: ['google/gemini-2.0-flash-exp:free'],
            plan: plan,
          };
        } catch (fallbackErr) {
          console.error('❌ Fallback also failed:', fallbackErr.message);
        }
      }
      
      // If API fails, fallback to mock
      return {
        ...mockReply(message),
        source: 'mock-fallback',
        plan: plan,
        error: err.message,
      };
    }
  },

  getAvailableModels: (plan = 'free') => getModelsForPlan(plan),
  getPrimaryModel: (plan = 'free') => getPrimaryModel(plan),
};

module.exports = LlmService;