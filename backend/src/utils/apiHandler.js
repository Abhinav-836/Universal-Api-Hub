// backend/src/utils/apiHandler.js
const UsageService = require('../services/usage.service');
const RateLimitService = require('../services/rateLimit.service');
const logger = require('./logger');

/**
 * Wraps an API handler with usage logging and fair billing.
 *
 * FIX: quota used to be charged for every request, including ones that
 * failed upstream or returned mock data. Now the units charged by
 * userRateLimit (req.costWeight) are refunded when:
 *   - the response status is >= 400, or
 *   - the handler marked the response as mock (res.locals.isMock = true).
 */
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
        error: capturedStatus >= 500 && capturedStatus !== 503
          ? 'Upstream service error'
          : err.message,
      });
    }
  } finally {
    const durationMs = Date.now() - start;
    const charged = req.costWeight ?? 0;
    const shouldRefund = charged > 0 && (capturedStatus >= 400 || res.locals.isMock === true);

    if (shouldRefund) {
      RateLimitService.refund(req.user?.id, charged).catch(() => {});
    }

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
      costWeight: shouldRefund ? 0 : (req.costWeight ?? req.apiCost ?? 1),
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      responseTimeMs: durationMs,
      errorMessage: capturedError?.message,
    }).catch(() => {});
  }
};

/** Mark the current response as mock data (no quota is charged). */
const markMock = (res) => {
  res.locals.isMock = true;
  res.set('X-Data-Source', 'mock');
};

module.exports = { withUsageLog, markMock };