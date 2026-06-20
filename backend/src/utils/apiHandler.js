const UsageService = require('../services/usage.service');
const logger = require('./logger');

const withUsageLog = (handler) => async (req, res) => {
  const start = Date.now();
  const originalStatus = res.status.bind(res);
  let capturedStatus = 200;
  let capturedError = null;

  res.status = (code) => {
    capturedStatus = code;
    return originalStatus(code);
  };

  try {
    await handler(req, res);
  } catch (err) {
    capturedError = err;
    capturedStatus = err.statusCode || err.status || 500;

    logger.error('API handler error', {
      error: err.message,
      endpoint: req.originalUrl,
      statusCode: capturedStatus,
    });

    if (!res.headersSent) {
      res.status(capturedStatus).json({
        success: false,
        error: capturedStatus >= 500 ? 'Upstream service error' : err.message,
      });
    }
  } finally {
    const durationMs = Date.now() - start;
    const status =
      capturedStatus === 429 ? 'rate_limited' : capturedStatus < 400 ? 'success' : 'error';

    UsageService.log({
      userId: req.user?.id,
      apiKeyId: req.apiKey?.id,
      apiId: req.apiId,
      endpoint: req.originalUrl,
      method: req.method,
      status,
      statusCode: capturedStatus,
      costWeight: req.costWeight ?? req.apiCost ?? 1,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      responseTimeMs: durationMs,
      errorMessage: capturedError?.message,
    }).catch(() => {});
  }
};

module.exports = { withUsageLog };
