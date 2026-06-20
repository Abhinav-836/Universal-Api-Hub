const { validationResult } = require('express-validator');
const LlmService = require('../services/llm.service');
const { withUsageLog } = require('../utils/apiHandler');

const llmChatHandler = withUsageLog(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { message, system, temperature, maxTokens, model } = req.body;
  
  // Get user's plan from request
  const plan = req.user?.plan || 'free';
  
  try {
    const result = await LlmService.chat({
      message,
      system,
      temperature,
      maxTokens,
      plan,
      model, // Optional: user can specify a specific model
    });

    res.json({
      success: true,
      reply: result.reply,
      model: result.model,
      usage: result.usage,
      finishReason: result.finishReason,
      source: result.source,
      plan: result.plan,
      availableModels: result.availableModels,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message || 'LLM service error',
    });
  }
});

module.exports = { llmChatHandler };