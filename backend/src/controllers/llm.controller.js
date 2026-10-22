// backend/src/controllers/llm.controller.js
const LlmService = require('../services/llm.service');
const { withUsageLog, markMock } = require('../utils/apiHandler');

// FIX: this handler used to catch every error and return 500 with the raw
// upstream message. Errors now propagate to withUsageLog, which returns the
// right status (503 for provider outages), hides internals, and refunds quota.
const llmChatHandler = withUsageLog(async (req, res) => {
  const { message, system, temperature, maxTokens, model } = req.body;
  const plan = req.user?.plan || 'free';

  const result = await LlmService.chat({
    message,
    system,
    temperature: temperature !== undefined ? Number(temperature) : undefined,
    maxTokens: maxTokens !== undefined ? parseInt(maxTokens, 10) : undefined,
    plan,
    model,
  });

  if (result.source === 'mock') markMock(res);

  res.json({
    success: true,
    reply: result.reply,
    model: result.model,
    usage: result.usage,
    finishReason: result.finishReason,
    source: result.source,
    plan: result.plan,
    availableModels: result.availableModels,
    ...(result.source === 'mock' && {
      notice: 'Demo response — no AI provider is configured. No quota was charged.',
    }),
  });
});

module.exports = { llmChatHandler };