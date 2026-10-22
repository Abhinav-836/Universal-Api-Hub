// backend/src/controllers/market.controller.js
const MarketService = require('../services/market.service');
const { withUsageLog } = require('../utils/apiHandler');

// Validation runs in the route (before quota is charged); unknown symbols
// throw 404 and provider outages 503 from the service — both refund quota.

const stockQuoteHandler = withUsageLog(async (req, res) => {
  const quote = await MarketService.getStockQuote(req.user.id, req.query.symbol);
  res.json({ success: true, quote });
});

const searchSymbolHandler = withUsageLog(async (req, res) => {
  const results = await MarketService.searchSymbol(req.user.id, req.query.keywords);
  res.json({ success: true, results });
});

const forexHandler = withUsageLog(async (req, res) => {
  const rate = await MarketService.getForexRate(req.user.id, req.query.from, req.query.to);
  res.json({ success: true, rate });
});

const cryptoHandler = withUsageLog(async (req, res) => {
  const { symbol, market = 'USD' } = req.query;
  const rate = await MarketService.getCryptoRate(req.user.id, symbol, market);
  res.json({ success: true, rate });
});

module.exports = {
  stockQuoteHandler,
  searchSymbolHandler,
  forexHandler,
  cryptoHandler,
};