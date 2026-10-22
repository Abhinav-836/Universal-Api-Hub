// backend/src/services/market.service.js
const axios = require('axios');
const YahooFinance = require('yahoo-finance2').default;
const { getRedis, TTL } = require('../config/redis');
const logger = require('../utils/logger');

// FIX: yahoo-finance2 v3 must be instantiated. The old v2-style call
// (`require(...).default.quote(...)`) threw "Call `const yahooFinance = new
// YahooFinance()` first" on every request, so this tier never worked.
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

// ── Provider configuration ────────────────────────────────────
const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;
const FINNHUB_API_KEY       = process.env.FINNHUB_API_KEY;
const ALPHA_VANTAGE_BASE    = 'https://www.alphavantage.co/query';
const FINNHUB_BASE          = 'https://finnhub.io/api/v1';
const HTTP_TIMEOUT_MS       = 8000;

// A provider returns:
//   - a result object/array  → success
//   - NOT_FOUND              → provider answered, but the symbol doesn't exist
//   - null                   → provider unavailable (no key, rate-limited, error)
const NOT_FOUND = Symbol('NOT_FOUND');

const httpError = (statusCode, message) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

// ============================================================
// TIER 1: Alpha Vantage
// ============================================================
async function fetchFromAlphaVantage(params) {
  if (!ALPHA_VANTAGE_API_KEY) return null;
  try {
    const response = await axios.get(ALPHA_VANTAGE_BASE, {
      params: { ...params, apikey: ALPHA_VANTAGE_API_KEY },
      timeout: HTTP_TIMEOUT_MS,
    });
    const d = response.data;
    if (d['Error Message']) return NOT_FOUND; // invalid symbol / currency
    if (d['Note'] || d['Information']) {
      logger.warn('Alpha Vantage rate-limited', { msg: d['Note'] || d['Information'] });
      return null;
    }
    return d;
  } catch (err) {
    logger.warn('Alpha Vantage request failed', { error: err.message });
    return null;
  }
}

async function alphaVantageQuote(symbol) {
  const data = await fetchFromAlphaVantage({ function: 'GLOBAL_QUOTE', symbol });
  if (!data || data === NOT_FOUND) return data;
  const q = data['Global Quote'];
  if (!q || !q['05. price']) return NOT_FOUND; // AV returns {} for unknown symbols
  return {
    symbol: q['01. symbol'],
    open: parseFloat(q['02. open']),
    high: parseFloat(q['03. high']),
    low: parseFloat(q['04. low']),
    price: parseFloat(q['05. price']),
    volume: parseInt(q['06. volume'], 10),
    latestTradingDay: q['07. latest trading day'],
    previousClose: parseFloat(q['08. previous close']),
    change: parseFloat(q['09. change']),
    changePercent: q['10. change percent'],
    source: 'alpha_vantage',
  };
}

async function alphaVantageSearch(keywords) {
  const data = await fetchFromAlphaVantage({ function: 'SYMBOL_SEARCH', keywords });
  if (!data || data === NOT_FOUND) return data;
  const matches = data.bestMatches || [];
  return matches.map((m) => ({
    symbol: m['1. symbol'],
    name: m['2. name'],
    type: m['3. type'],
    region: m['4. region'],
    currency: m['8. currency'],
    source: 'alpha_vantage',
  }));
}

async function alphaVantageRate(from, to) {
  const data = await fetchFromAlphaVantage({
    function: 'CURRENCY_EXCHANGE_RATE',
    from_currency: from,
    to_currency: to,
  });
  if (!data || data === NOT_FOUND) return data;
  const r = data['Realtime Currency Exchange Rate'];
  if (!r) return NOT_FOUND;
  return {
    rate: parseFloat(r['5. Exchange Rate']),
    lastRefreshed: r['6. Last Refreshed'],
    bid: parseFloat(r['8. Bid Price']) || null,
    ask: parseFloat(r['9. Ask Price']) || null,
    source: 'alpha_vantage',
  };
}

// ============================================================
// TIER 2: Finnhub (stocks only on the free tier)
// ============================================================
async function fetchFromFinnhub(path, params = {}) {
  if (!FINNHUB_API_KEY) return null;
  try {
    const response = await axios.get(`${FINNHUB_BASE}${path}`, {
      params: { ...params, token: FINNHUB_API_KEY },
      timeout: HTTP_TIMEOUT_MS,
    });
    return response.data;
  } catch (err) {
    const status = err.response?.status;
    if (status === 429) logger.warn('Finnhub rate-limited');
    else if (status === 401 || status === 403) logger.warn('Finnhub auth failed — check FINNHUB_API_KEY');
    else logger.warn('Finnhub request failed', { path, error: err.message, status });
    return null;
  }
}

async function finnhubQuote(symbol) {
  const data = await fetchFromFinnhub('/quote', { symbol });
  if (!data) return null;
  if (!data.c) return NOT_FOUND; // Finnhub returns c=0 for unknown symbols

  const changePercent = data.pc
    ? `${(((data.c - data.pc) / data.pc) * 100).toFixed(2)}%`
    : '0.00%';

  return {
    symbol,
    open: data.o,
    high: data.h,
    low: data.l,
    price: data.c,
    volume: null, // Finnhub /quote does not return volume
    latestTradingDay: data.t
      ? new Date(data.t * 1000).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10),
    previousClose: data.pc,
    change: data.d,
    changePercent,
    source: 'finnhub',
  };
}

async function finnhubSearch(keywords) {
  const data = await fetchFromFinnhub('/search', { q: keywords });
  if (!data) return null;
  return (data.result || [])
    .filter((r) => r.type === 'Common Stock' || r.type === 'ETP' || !r.type)
    .slice(0, 10)
    .map((r) => ({
      symbol: r.symbol,
      name: r.description || r.symbol,
      type: r.type || 'Equity',
      region: r.symbol.includes('.') ? 'International' : 'United States',
      currency: null, // Finnhub search doesn't return currency
      source: 'finnhub',
    }));
}

// ============================================================
// TIER 3: Yahoo Finance
// ============================================================
function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

async function yahooQuoteRaw(symbol, label) {
  try {
    const q = await withTimeout(
      yahooFinance.quote(symbol, {}, { validateResult: false }),
      HTTP_TIMEOUT_MS,
      label
    );
    if (!q || q.regularMarketPrice == null) return NOT_FOUND;
    return q;
  } catch (err) {
    // yahoo-finance2 throws for unknown symbols too; treat "not found"
    // style messages as NOT_FOUND, everything else as unavailable.
    if (/not found|no data|invalid/i.test(err.message)) return NOT_FOUND;
    logger.warn(`${label} failed`, { symbol, error: err.message });
    return null;
  }
}

const yahooTime = (t) => {
  if (!t) return new Date().toISOString();
  const d = t instanceof Date ? t : new Date(typeof t === 'number' && t < 1e12 ? t * 1000 : t);
  return isNaN(d) ? new Date().toISOString() : d.toISOString();
};

async function yahooQuote(symbol) {
  const q = await yahooQuoteRaw(symbol, 'Yahoo quote');
  if (!q || q === NOT_FOUND) return q;
  return {
    symbol: q.symbol,
    open: q.regularMarketOpen ?? null,
    high: q.regularMarketDayHigh ?? null,
    low: q.regularMarketDayLow ?? null,
    price: q.regularMarketPrice,
    volume: q.regularMarketVolume ?? null,
    latestTradingDay: yahooTime(q.regularMarketTime).slice(0, 10),
    previousClose: q.regularMarketPreviousClose ?? null,
    change: q.regularMarketChange ?? null,
    changePercent: `${(q.regularMarketChangePercent || 0).toFixed(2)}%`,
    source: 'yahoo',
  };
}

async function yahooSearch(keywords) {
  try {
    const results = await withTimeout(
      yahooFinance.search(keywords, {}, { validateResult: false }),
      HTTP_TIMEOUT_MS,
      'Yahoo search'
    );
    return (results?.quotes || [])
      .filter((q) => q.symbol && (q.quoteType === 'EQUITY' || q.quoteType === 'ETF'))
      .slice(0, 10)
      .map((q) => ({
        symbol: q.symbol,
        name: q.shortname || q.longname || q.symbol,
        type: q.quoteType || 'Equity',
        region: q.exchange || null,
        currency: q.currency || null,
        source: 'yahoo',
      }));
  } catch (err) {
    logger.warn('Yahoo search failed', { keywords, error: err.message });
    return null;
  }
}

async function yahooRate(ySymbol) {
  const q = await yahooQuoteRaw(ySymbol, 'Yahoo rate');
  if (!q || q === NOT_FOUND) return q;
  return {
    rate: q.regularMarketPrice,
    lastRefreshed: yahooTime(q.regularMarketTime),
    bid: q.bid || null,
    ask: q.ask || null,
    source: 'yahoo',
  };
}

// ============================================================
// FALLBACK RUNNER
// FIX: there is no mock tier any more. Returning a made-up price with
// success:true is the worst thing a market-data API can do. Unknown
// symbols now 404, and provider outages 503 (and the quota is refunded).
// ============================================================
async function runProviders(providers, { notFoundMessage, emptyIsResult = false }) {
  let sawNotFound = false;
  let emptyResult = null;

  for (const { name, fn } of providers) {
    try {
      const result = await fn();
      if (result === NOT_FOUND) { sawNotFound = true; continue; }
      if (result == null) continue;
      if (Array.isArray(result) && result.length === 0) {
        if (emptyIsResult) emptyResult = result;
        continue;
      }
      logger.debug(`Provider succeeded: ${name}`);
      return result;
    } catch (err) {
      logger.warn(`Provider threw: ${name}`, { error: err.message });
    }
  }

  if (emptyResult) return emptyResult;
  if (sawNotFound) throw httpError(404, notFoundMessage);
  throw httpError(503, 'Market data providers are temporarily unavailable. Please retry shortly.');
}

async function cached(cacheKey, ttl, producer) {
  const redis = getRedis();
  try {
    const hit = await redis.get(cacheKey);
    if (hit) return JSON.parse(hit);
  } catch (_) { /* ignore */ }

  const result = await producer();

  try {
    await redis.set(cacheKey, JSON.stringify(result), 'EX', ttl);
  } catch (_) { /* ignore */ }
  return result;
}

// ============================================================
// SERVICE
// ============================================================
const MarketService = {
  async getStockQuote(userId, symbol) {
    const sym = symbol.trim().toUpperCase();
    return cached(`market:quote:${sym}`, TTL.ONE_MINUTE, () =>
      runProviders([
        { name: 'alpha_vantage', fn: () => alphaVantageQuote(sym) },
        { name: 'finnhub',       fn: () => finnhubQuote(sym) },
        { name: 'yahoo',         fn: () => yahooQuote(sym) },
      ], { notFoundMessage: `Symbol "${sym}" not found` })
    );
  },

  async searchSymbol(userId, keywords) {
    const kw = keywords.trim();
    return cached(`market:search:${kw.toLowerCase()}`, TTL.FIVE_MINUTES, () =>
      runProviders([
        { name: 'alpha_vantage', fn: () => alphaVantageSearch(kw) },
        { name: 'finnhub',       fn: () => finnhubSearch(kw) },
        { name: 'yahoo',         fn: () => yahooSearch(kw) },
      ], { notFoundMessage: 'No matching symbols', emptyIsResult: true })
    );
  },

  async getForexRate(userId, fromCurrency, toCurrency) {
    const from = fromCurrency.trim().toUpperCase();
    const to   = toCurrency.trim().toUpperCase();
    const rate = await cached(`market:forex:${from}${to}`, TTL.ONE_MINUTE * 2, () =>
      runProviders([
        { name: 'alpha_vantage', fn: () => alphaVantageRate(from, to) },
        { name: 'yahoo',         fn: () => yahooRate(`${from}${to}=X`) },
      ], { notFoundMessage: `Currency pair ${from}/${to} not found` })
    );
    return { from, to, ...rate };
  },

  // FIX: response shape is now identical whichever provider answers
  // (Alpha Vantage used to return {from,to,rate}, Yahoo {symbol,market,price}).
  async getCryptoRate(userId, symbol, market = 'USD') {
    const sym = symbol.trim().toUpperCase();
    const mkt = market.trim().toUpperCase();
    const r = await cached(`market:crypto:${sym}${mkt}`, TTL.ONE_MINUTE, () =>
      runProviders([
        { name: 'alpha_vantage', fn: () => alphaVantageRate(sym, mkt) },
        { name: 'yahoo',         fn: () => yahooRate(`${sym}-${mkt}`) },
      ], { notFoundMessage: `Crypto pair ${sym}/${mkt} not found` })
    );
    return {
      symbol: sym,
      market: mkt,
      price: r.rate,
      lastRefreshed: r.lastRefreshed,
      bid: r.bid,
      ask: r.ask,
      source: r.source,
    };
  },
};

module.exports = MarketService;