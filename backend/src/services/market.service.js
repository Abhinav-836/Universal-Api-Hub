// backend/src/services/market.service.js
const axios = require('axios');
const { getRedis, KEYS, TTL } = require('../config/redis');
const { PLANS } = require('../utils/constants');
const logger = require('../utils/logger');

const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;
const ALPHA_VANTAGE_BASE_URL = 'https://www.alphavantage.co/query';

// NO yahoo-finance2 import - using simple version

async function getUserPlan(userId) {
  if (!userId) return 'free';
  const redis = getRedis();
  const cacheKey = `user:${userId}:plan`;
  try {
    const cached = await redis.get(cacheKey);
    if (cached) return cached;
  } catch (_) { /* ignore */ }
  try {
    const db = require('../config/db');
    const result = await db.query('SELECT plan FROM users WHERE id = $1', [userId]);
    const plan = result.rows[0]?.plan || 'free';
    await redis.set(cacheKey, plan, 'EX', 300);
    return plan;
  } catch (err) {
    return 'free';
  }
}

async function fetchFromAlphaVantage(userId, params) {
  if (!ALPHA_VANTAGE_API_KEY) {
    logger.warn('Alpha Vantage API key not configured');
    return null;
  }
  try {
    const response = await axios.get(ALPHA_VANTAGE_BASE_URL, {
      params: { ...params, apikey: ALPHA_VANTAGE_API_KEY },
      timeout: 8000,
    });
    if (response.data['Error Message'] || response.data['Note']) {
      logger.warn('Alpha Vantage error:', response.data['Error Message'] || response.data['Note']);
      return null;
    }
    return response.data;
  } catch (err) {
    logger.error('Alpha Vantage request failed:', err.message);
    return null;
  }
}

const MarketService = {
  async getStockQuote(userId, symbol) {
    const cacheKey = `market:quote:${symbol.toUpperCase()}`;
    const redis = getRedis();
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (_) { /* ignore */ }

    const avData = await fetchFromAlphaVantage(userId, {
      function: 'GLOBAL_QUOTE',
      symbol: symbol.toUpperCase(),
    });

    if (!avData || !avData['Global Quote']) {
      throw new Error(`No data found for symbol ${symbol}`);
    }

    const quote = avData['Global Quote'];
    const result = {
      symbol: quote['01. symbol'],
      open: parseFloat(quote['02. open']),
      high: parseFloat(quote['03. high']),
      low: parseFloat(quote['04. low']),
      price: parseFloat(quote['05. price']),
      volume: parseInt(quote['06. volume']),
      latestTradingDay: quote['07. latest trading day'],
      previousClose: parseFloat(quote['08. previous close']),
      change: parseFloat(quote['09. change']),
      changePercent: quote['10. change percent'],
      source: 'alpha_vantage',
    };

    await redis.set(cacheKey, JSON.stringify(result), 'EX', TTL.ONE_MINUTE);
    return result;
  },

  async searchSymbol(userId, keywords) {
    const cacheKey = `market:search:${keywords}`;
    const redis = getRedis();
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (_) { /* ignore */ }

    const avData = await fetchFromAlphaVantage(userId, {
      function: 'SYMBOL_SEARCH',
      keywords,
    });

    const matches = (avData?.bestMatches || []).map(m => ({
      symbol: m['1. symbol'],
      name: m['2. name'],
      type: m['3. type'],
      region: m['4. region'],
      currency: m['8. currency'],
      source: 'alpha_vantage',
    }));

    await redis.set(cacheKey, JSON.stringify(matches), 'EX', TTL.FIVE_MINUTES);
    return matches;
  },

  async getForexRate(userId, fromCurrency, toCurrency) {
    const fromUp = fromCurrency.toUpperCase();
    const toUp = toCurrency.toUpperCase();
    const cacheKey = `market:forex:${fromUp}${toUp}`;
    const redis = getRedis();
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (_) { /* ignore */ }

    const avData = await fetchFromAlphaVantage(userId, {
      function: 'CURRENCY_EXCHANGE_RATE',
      from_currency: fromUp,
      to_currency: toUp,
    });

    if (!avData || !avData['Realtime Currency Exchange Rate']) {
      throw new Error(`Forex rate not found for ${fromUp}/${toUp}`);
    }

    const rate = avData['Realtime Currency Exchange Rate'];
    const result = {
      from: rate['1. From_Currency Code'],
      to: rate['3. To_Currency Code'],
      rate: parseFloat(rate['5. Exchange Rate']),
      lastRefreshed: rate['6. Last Refreshed'],
      bid: parseFloat(rate['8. Bid Price']),
      ask: parseFloat(rate['9. Ask Price']),
      source: 'alpha_vantage',
    };

    await redis.set(cacheKey, JSON.stringify(result), 'EX', TTL.ONE_MINUTE * 2);
    return result;
  },

  async getCryptoRate(userId, symbol, market = 'USD') {
    const symbolUp = symbol.toUpperCase();
    const marketUp = market.toUpperCase();
    const cacheKey = `market:crypto:${symbolUp}${marketUp}`;
    const redis = getRedis();
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (_) { /* ignore */ }

    const avData = await fetchFromAlphaVantage(userId, {
      function: 'CURRENCY_EXCHANGE_RATE',
      from_currency: symbolUp,
      to_currency: marketUp,
    });

    if (!avData || !avData['Realtime Currency Exchange Rate']) {
      throw new Error(`Crypto rate not found for ${symbolUp}/${marketUp}`);
    }

    const rate = avData['Realtime Currency Exchange Rate'];
    const result = {
      symbol: rate['1. From_Currency Code'],
      market: rate['3. To_Currency Code'],
      price: parseFloat(rate['5. Exchange Rate']),
      lastRefreshed: rate['6. Last Refreshed'],
      bid: parseFloat(rate['8. Bid Price']),
      ask: parseFloat(rate['9. Ask Price']),
      source: 'alpha_vantage',
    };

    await redis.set(cacheKey, JSON.stringify(result), 'EX', TTL.ONE_MINUTE);
    return result;
  },
};

module.exports = MarketService;