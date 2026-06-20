// backend/src/middleware/apiKeyScope.js
/**
 * Validates that the API key's scoped_apis array permits the current endpoint.
 * Run AFTER apiKeyAuth. If scoped_apis is null, all access is permitted.
 */
const apiKeyScope = (requiredScope) => (req, res, next) => {
  const key = req.apiKey;
  if (!key) return res.status(401).json({ success: false, error: 'No API key attached' });

  if (!key.scoped_apis || key.scoped_apis.length === 0) return next(); // Unrestricted key

  if (!key.scoped_apis.includes(requiredScope)) {
    return res.status(403).json({
      success: false,
      error: `This API key does not have scope: ${requiredScope}`,
      scopes: key.scoped_apis,
    });
  }
  next();
};

module.exports = { apiKeyScope };
