// backend/src/services/market.service.js
const axios = require('axios');
const yahooFinance = require('yahoo-finance2').default;
const { getRedis,  TTL } = require('../config/redis');
const logger = require('../utils/logger');

// Suppress yahoo-finance2's console notices (safe to omit if it errors)
try {
  if (yahooFinance.suppressNotices) yahooFinance.suppressNotices(['yahooSurvey']);
} catch (_) { /* ignore */ }

// ── Provider configuration ────────────────────────────────────
const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;
const FINNHUB_API_KEY       = process.env.FINNHUB_API_KEY;
const ALPHA_VANTAGE_BASE    = 'https://www.alphavantage.co/query';
const FINNHUB_BASE          = 'https://finnhub.io/api/v1';

// ── Per-provider HTTP timeout ─────────────────────────────────
const HTTP_TIMEOUT_MS = 8000;

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
    if (d['Error Message'] || d['Note'] || d['Information']) {
      logger.warn('Alpha Vantage rate-limited or errored', {
        msg: d['Error Message'] || d['Note'] || d['Information'],
      });
      return null;
    }
    return d;
  } catch (err) {
    logger.warn('Alpha Vantage request failed', { error: err.message });
    return null;
  }
}

async function alphaVantageQuote(symbol) {
  const data = await fetchFromAlphaVantage({
    function: 'GLOBAL_QUOTE',
    symbol: symbol.toUpperCase(),
  });
  if (!data || !data['Global Quote'] || !data['Global Quote']['05. price']) return null;
  const q = data['Global Quote'];
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
  const data = await fetchFromAlphaVantage({
    function: 'SYMBOL_SEARCH',
    keywords,
  });
  if (!data || !data.bestMatches || data.bestMatches.length === 0) return null;
  return data.bestMatches.map(m => ({
    symbol: m['1. symbol'],
    name: m['2. name'],
    type: m['3. type'],
    region: m['4. region'],
    currency: m['8. currency'],
    source: 'alpha_vantage',
  }));
}

async function alphaVantageForex(from, to) {
  const data = await fetchFromAlphaVantage({
    function: 'CURRENCY_EXCHANGE_RATE',
    from_currency: from.toUpperCase(),
    to_currency: to.toUpperCase(),
  });
  const r = data && data['Realtime Currency Exchange Rate'];
  if (!r) return null;
  return {
    from: r['1. From_Currency Code'],
    to: r['3. To_Currency Code'],
    rate: parseFloat(r['5. Exchange Rate']),
    lastRefreshed: r['6. Last Refreshed'],
    bid: parseFloat(r['8. Bid Price']),
    ask: parseFloat(r['9. Ask Price']),
    source: 'alpha_vantage',
  };
}

async function alphaVantageCrypto(symbol, market) {
  // Alpha Vantage treats crypto the same as forex
  return alphaVantageForex(symbol, market);
}

// ============================================================
// TIER 2: Finnhub
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
    if (err.response?.status === 429) {
      logger.warn('Finnhub rate-limited');
    } else if (err.response?.status === 401 || err.response?.status === 403) {
      logger.warn('Finnhub auth failed — check FINNHUB_API_KEY');
    } else {
      logger.warn('Finnhub request failed', {
        path,
        error: err.message,
        status: err.response?.status,
      });
    }
    return null;
  }
}

async function finnhubQuote(symbol) {
  const data = await fetchFromFinnhub('/quote', { symbol: symbol.toUpperCase() });
  // Finnhub returns c=0 when symbol not found
  if (!data || !data.c || data.c === 0) return null;

  const changePercent = data.pc
    ? `${(((data.c - data.pc) / data.pc) * 100).toFixed(2)}%`
    : '0.00%';

  return {
    symbol: symbol.toUpperCase(),
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
  if (!data || !data.result || data.result.length === 0) return null;
  return data.result
    .filter(r => r.type === 'Common Stock' || r.type === 'ETP' || !r.type)
    .slice(0, 10)
    .map(r => ({
      symbol: r.symbol,
      name: r.description || r.symbol,
      type: r.type || 'Equity',
      region: r.symbol.includes('.') ? 'International' : 'United States',
      currency: 'USD',
      source: 'finnhub',
    }));
}

// Finnhub free tier does NOT offer forex/crypto. We return null so the
// chain falls through to Yahoo, which does support them.
async function finnhubForex()      { return null; }
async function finnhubCrypto()     { return null; }

// ============================================================
// TIER 3: Yahoo Finance
// ============================================================
async function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out`)), ms)
    ),
  ]);
}

async function yahooQuote(symbol) {
  try {
    const q = await withTimeout(
      yahooFinance.quote(symbol.toUpperCase(), {}, { validateResult: false }),
      HTTP_TIMEOUT_MS,
      'Yahoo quote'
    );
    if (!q || !q.regularMarketPrice) return null;
    return {
      symbol: q.symbol,
      open: q.regularMarketOpen,
      high: q.regularMarketDayHigh,
      low: q.regularMarketDayLow,
      price: q.regularMarketPrice,
      volume: q.regularMarketVolume,
      latestTradingDay: new Date(q.regularMarketTime * 1000).toISOString().slice(0, 10),
      previousClose: q.regularMarketPreviousClose,
      change: q.regularMarketChange,
      changePercent: `${(q.regularMarketChangePercent || 0).toFixed(2)}%`,
      source: 'yahoo',
    };
  } catch (err) {
    logger.warn('Yahoo quote failed', { symbol, error: err.message });
    return null;
  }
}

async function yahooSearch(keywords) {
  try {
    const results = await withTimeout(
      yahooFinance.search(keywords, {}, { validateResult: false }),
      HTTP_TIMEOUT_MS,
      'Yahoo search'
    );
    if (!results || !results.quotes || results.quotes.length === 0) return null;
    return results.quotes
      .filter(q => q.symbol && (q.quoteType === 'EQUITY' || q.quoteType === 'ETF'))
      .slice(0, 10)
      .map(q => ({
        symbol: q.symbol,
        name: q.shortname || q.longname || q.symbol,
        type: q.quoteType || 'Equity',
        region: q.exchange || 'US',
        currency: q.currency || 'USD',
        source: 'yahoo',
      }));
  } catch (err) {
    logger.warn('Yahoo search failed', { keywords, error: err.message });
    return null;
  }
}

async function yahooForex(from, to) {
  const symbol = `${from.toUpperCase()}${to.toUpperCase()}=X`;
  try {
    const q = await withTimeout(
      yahooFinance.quote(symbol, {}, { validateResult: false }),
      HTTP_TIMEOUT_MS,
      'Yahoo forex'
    );
    if (!q || !q.regularMarketPrice) return null;
    return {
      from: from.toUpperCase(),
      to: to.toUpperCase(),
      rate: q.regularMarketPrice,
      lastRefreshed: new Date(q.regularMarketTime * 1000).toISOString(),
      bid: q.bid || null,
      ask: q.ask || null,
      source: 'yahoo',
    };
  } catch (err) {
    logger.warn('Yahoo forex failed', { from, to, error: err.message });
    return null;
  }
}

async function yahooCrypto(symbol, market) {
  const ySymbol = `${symbol.toUpperCase()}-${market.toUpperCase()}`;
  try {
    const q = await withTimeout(
      yahooFinance.quote(ySymbol, {}, { validateResult: false }),
      HTTP_TIMEOUT_MS,
      'Yahoo crypto'
    );
    if (!q || !q.regularMarketPrice) return null;
    return {
      symbol: symbol.toUpperCase(),
      market: market.toUpperCase(),
      price: q.regularMarketPrice,
      lastRefreshed: new Date(q.regularMarketTime * 1000).toISOString(),
      bid: q.bid || null,
      ask: q.ask || null,
      source: 'yahoo',
    };
  } catch (err) {
    logger.warn('Yahoo crypto failed', { symbol, market, error: err.message });
    return null;
  }
}

// ============================================================
// TIER 4: Mock (last resort)
// ============================================================
const mockQuote = (symbol) => ({
  symbol: symbol.toUpperCase(),
  open: 148.50,
  high: 152.30,
  low: 147.10,
  price: 151.25,
  volume: 45000000,
  latestTradingDay: new Date().toISOString().slice(0, 10),
  previousClose: 148.90,
  change: 2.35,
  changePercent: '1.58%',
  source: 'mock',
});

const mockSearch = (keywords) => ([
  { symbol: 'AAPL',  name: 'Apple Inc.',           type: 'Equity', region: 'United States', currency: 'USD', source: 'mock' },
  { symbol: 'MSFT',  name: 'Microsoft Corporation', type: 'Equity', region: 'United States', currency: 'USD', source: 'mock' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.',        type: 'Equity', region: 'United States', currency: 'USD', source: 'mock' },
].filter(r =>
  !keywords ||
  r.symbol.includes(keywords.toUpperCase()) ||
  r.name.toLowerCase().includes(keywords.toLowerCase())
));

const mockForex = (from, to) => ({
  from: from.toUpperCase(),
  to: to.toUpperCase(),
  rate: 1.0850,
  lastRefreshed: new Date().toISOString(),
  bid: 1.0848,
  ask: 1.0852,
  source: 'mock',
});

const mockCrypto = (symbol, market) => ({
  symbol: symbol.toUpperCase(),
  market: market.toUpperCase(),
  price: 67500.00,
  lastRefreshed: new Date().toISOString(),
  bid: 67490.00,
  ask: 67510.00,
  source: 'mock',
});

// ============================================================
// FALLBACK RUNNER — runs providers in order until one succeeds
// ============================================================
async function tryProviders(providers) {
  for (const { name, fn } of providers) {
    try {
      const result = await fn();
      if (result) {
        logger.debug(`Provider succeeded: ${name}`);
        return result;
      }
      logger.debug(`Provider returned no data: ${name}`);
    } catch (err) {
      logger.warn(`Provider threw: ${name}`, { error: err.message });
    }
  }
  return null;
}

// ============================================================
// SERVICE
// ============================================================

const MarketService = {
  async getStockQuote(userId, symbol) {
    const sym = symbol.toUpperCase();
    const cacheKey = `market:quote:${sym}`;
    const redis = getRedis();
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (_) { /* ignore */ }

    let result = await tryProviders([
      { name: 'alpha_vantage', fn: () => alphaVantageQuote(sym) },
      { name: 'finnhub',       fn: () => finnhubQuote(sym) },
      { name: 'yahoo',         fn: () => yahooQuote(sym) },
    ]);

    if (!result) {
      logger.warn(`All providers failed for ${sym} quote, using mock`);
      result = mockQuote(sym);
    }

    try {
      await redis.set(cacheKey, JSON.stringify(result), 'EX', TTL.ONE_MINUTE);
    } catch (_) { /* ignore */ }
    return result;
  },

  async searchSymbol(userId, keywords) {
    const cacheKey = `market:search:${keywords}`;
    const redis = getRedis();
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (_) { /* ignore */ }

    let result = await tryProviders([
      { name: 'alpha_vantage', fn: () => alphaVantageSearch(keywords) },
      { name: 'finnhub',       fn: () => finnhubSearch(keywords) },
      { name: 'yahoo',         fn: () => yahooSearch(keywords) },
    ]);

    if (!result || result.length === 0) {
      result = mockSearch(keywords);
    }

    try {
      await redis.set(cacheKey, JSON.stringify(result), 'EX', TTL.FIVE_MINUTES);
    } catch (_) { /* ignore */ }
    return result;
  },

  async getForexRate(userId, fromCurrency, toCurrency) {
    const fromUp = fromCurrency.toUpperCase();
    const toUp   = toCurrency.toUpperCase();
    const cacheKey = `market:forex:${fromUp}${toUp}`;
    const redis = getRedis();
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (_) { /* ignore */ }

    let result = await tryProviders([
      { name: 'alpha_vantage', fn: () => alphaVantageForex(fromUp, toUp) },
      { name: 'finnhub',       fn: () => finnhubForex(fromUp, toUp) },   // returns null on free tier
      { name: 'yahoo',         fn: () => yahooForex(fromUp, toUp) },
    ]);

    if (!result) {
      result = mockForex(fromUp, toUp);
    }

    try {
      await redis.set(cacheKey, JSON.stringify(result), 'EX', TTL.ONE_MINUTE * 2);
    } catch (_) { /* ignore */ }
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

    let result = await tryProviders([
      { name: 'alpha_vantage', fn: () => alphaVantageCrypto(symbolUp, marketUp) },
      { name: 'finnhub',       fn: () => finnhubCrypto(symbolUp, marketUp) }, // null on free tier
      { name: 'yahoo',         fn: () => yahooCrypto(symbolUp, marketUp) },
    ]);

    if (!result) {
      result = mockCrypto(symbolUp, marketUp);
    }

    try {
      await redis.set(cacheKey, JSON.stringify(result), 'EX', TTL.ONE_MINUTE);
    } catch (_) { /* ignore */ }
    return result;
  },
};

module.exports = MarketService;