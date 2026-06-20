const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { apiKeyAuth } = require('../middleware/auth.middleware');
const { userRateLimit } = require('../middleware/rateLimiter');
const { apiAccessCheck } = require('../middleware/apiAccess');
const {
  chatHandler,
  imageAnalyzeHandler,
  weatherHandler,
  translateHandler,
  sentimentHandler,
  summarizeHandler,
  geocodeHandler,
} = require('../controllers/api.controller');
const { newsHandler } = require('../controllers/news.controller');
const { sportsHandler } = require('../controllers/sports.controller');
const { llmChatHandler } = require('../controllers/llm.controller');
const {
  stockQuoteHandler,
  searchSymbolHandler,
  forexHandler,
  cryptoHandler,
} = require('../controllers/market.controller');

const router = express.Router();  // <-- THIS WAS MISSING

// Helper to validate and pipe through middleware
const checkValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
};

const pipe = (slug, handler) => [
  apiKeyAuth,
  apiAccessCheck(slug),
  userRateLimit,
  checkValidation,
  handler,
];

// ── Routes ─────────────────────────────────────────────────────────

router.post('/v1/chat', [
  body('message').isString().trim().notEmpty().withMessage('Message is required').isLength({ max: 2000 }),
  body('system').optional().isString().isLength({ max: 1000 }),
], ...pipe('chat', chatHandler));

router.post('/v1/image/analyze', [
  body('imageUrl').optional().isURL({
    require_tld: true,
    require_protocol: true,
    protocols: ['http', 'https'],
    host_blacklist: ['localhost', '127.0.0.1', '169.254.169.254', '0.0.0.0', '[::1]']
  }).withMessage('Invalid or restricted URL'),
  body('imageBase64').optional().isString().isLength({ max: 5000000 }),
  body('features').optional().isArray(),
], ...pipe('image-analyze', imageAnalyzeHandler));

router.get('/v1/weather', [
  query('city').optional().isString().trim().isLength({ max: 100 }),
  query('lat').optional().isFloat({ min: -90, max: 90 }),
  query('lon').optional().isFloat({ min: -180, max: 180 }),
  query('units').optional().isIn(['metric', 'imperial']),
], ...pipe('weather', weatherHandler));

router.post('/v1/translate', [
  body('text').isString().trim().notEmpty().isLength({ max: 5000 }),
  body('targetLanguage').isString().trim().notEmpty().isLength({ max: 10 }),
  body('sourceLanguage').optional().isString().trim().isLength({ max: 10 }),
], ...pipe('translate', translateHandler));

router.post('/v1/sentiment', [
  body('text').isString().trim().notEmpty().isLength({ max: 5000 }),
], ...pipe('sentiment', sentimentHandler));

router.post('/v1/summarize', [
  body('text').isString().trim().notEmpty().isLength({ min: 100, max: 20000 }),
  body('maxLength').optional().isInt({ min: 50, max: 1000 }),
  body('style').optional().isIn(['paragraph', 'bullets']),
], ...pipe('summarize', summarizeHandler));

router.get('/v1/geocode', [
  query('address').optional().isString().trim().isLength({ max: 200 }),
  query('lat').optional().isFloat({ min: -90, max: 90 }),
  query('lon').optional().isFloat({ min: -180, max: 180 }),
], ...pipe('geocode', geocodeHandler));

router.get('/v1/news', [
  query('q').optional().isString().trim().isLength({ min: 1, max: 100 }),
  query('category').optional().isIn(['business', 'entertainment', 'general', 'health', 'science', 'sports', 'technology']),
  query('country').optional().isLength({ min: 2, max: 2 }).isAlpha(),
  query('pageSize').optional().isInt({ min: 1, max: 25 }),
  query('page').optional().isInt({ min: 1, max: 5 }),
], ...pipe('news', newsHandler));

router.get('/v1/sports', [
  query('league').optional().isIn(['soccer', 'football', 'basketball', 'cricket', 'baseball']),
  query('team').optional().isString().trim().isLength({ min: 1, max: 60 }),
  query('date').optional().isISO8601(),
  query('pageSize').optional().isInt({ min: 1, max: 25 }),
], ...pipe('sports', sportsHandler));

router.post('/v1/llm/chat', [
  body('message').isString().trim().isLength({ min: 1, max: 4000 }),
  body('system').optional().isString().isLength({ max: 1000 }),
  body('temperature').optional().isFloat({ min: 0, max: 2 }),
  body('maxTokens').optional().isInt({ min: 1, max: 1000 }),
], ...pipe('llm-chat', llmChatHandler));

// ── Market Routes (Alpha Vantage) ──────────────────────────────────
router.get('/v1/stocks/quote', [
  query('symbol').isString().trim().notEmpty().isLength({ min: 1, max: 10 }),
], ...pipe('stock-quote', stockQuoteHandler));

router.get('/v1/stocks/search', [
  query('keywords').isString().trim().notEmpty().isLength({ min: 1, max: 50 }),
], ...pipe('stock-search', searchSymbolHandler));

router.get('/v1/forex', [
  query('from').isString().trim().notEmpty().isLength({ min: 1, max: 5 }),
  query('to').isString().trim().notEmpty().isLength({ min: 1, max: 5 }),
], ...pipe('forex', forexHandler));

router.get('/v1/crypto', [
  query('symbol').isString().trim().notEmpty().isLength({ min: 1, max: 10 }),
  query('market').optional().isString().trim().isLength({ min: 1, max: 5 }),
], ...pipe('crypto', cryptoHandler));

module.exports = router;