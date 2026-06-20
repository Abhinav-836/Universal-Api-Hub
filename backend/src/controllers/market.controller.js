// backend/src/controllers/market.controller.js
const { validationResult } = require('express-validator');
const MarketService = require('../services/market.service');
const { withUsageLog } = require('../utils/apiHandler');

const stockQuoteHandler = withUsageLog(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  const { symbol } = req.query;
  if (!symbol) {
    return res.status(400).json({ success: false, error: 'symbol query parameter required' });
  }
  const quote = await MarketService.getStockQuote(req.user.id, symbol);
  res.json({ success: true, quote });
});

const searchSymbolHandler = withUsageLog(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  const { keywords } = req.query;
  if (!keywords) {
    return res.status(400).json({ success: false, error: 'keywords query parameter required' });
  }
  const results = await MarketService.searchSymbol(req.user.id, keywords);
  res.json({ success: true, results });
});

const forexHandler = withUsageLog(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  const { from, to } = req.query;
  if (!from || !to) {
    return res.status(400).json({ success: false, error: 'from and to query parameters required' });
  }
  const rate = await MarketService.getForexRate(req.user.id, from, to);
  res.json({ success: true, rate });
});

const cryptoHandler = withUsageLog(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  const { symbol, market = 'USD' } = req.query;
  if (!symbol) {
    return res.status(400).json({ success: false, error: 'symbol query parameter required' });
  }
  const rate = await MarketService.getCryptoRate(req.user.id, symbol, market);
  res.json({ success: true, rate });
});

module.exports = {
  stockQuoteHandler,
  searchSymbolHandler,
  forexHandler,
  cryptoHandler,
};