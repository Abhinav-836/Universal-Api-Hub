// Stock quotes and search when Finnhub has no key (as on Render today):
// they must come from Yahoo's public chart/search JSON instead of failing
// with 503. Responses below are real Yahoo payloads, trimmed.
jest.mock('axios');
jest.mock('../src/config/redis', () => ({
  getRedis: () => ({ get: async () => null, set: async () => 'OK' }),
  TTL: { ONE_MINUTE: 60, FIVE_MINUTES: 300 },
}));

delete process.env.FINNHUB_API_KEY;
delete process.env.ALPHA_VANTAGE_API_KEY;

const axios = require('axios');
const MarketService = require('../src/services/market.service');

const CHART_AAPL = {
  chart: {
    result: [{
      meta: {
        currency: 'USD', symbol: 'AAPL', regularMarketTime: 1793998801, regularMarketPrice: 342.37,
        regularMarketDayHigh: 345.79, regularMarketDayLow: 338.3, regularMarketVolume: 44703806,
        chartPreviousClose: 344.17,
      },
    }],
    error: null,
  },
};
const SEARCH_APPLE = {
  quotes: [
    { exchange: 'NMS', shortname: 'Apple Inc.', quoteType: 'EQUITY', symbol: 'AAPL', exchDisp: 'NASDAQ' },
    { exchange: 'CME', shortname: 'Apple Inc Stock Futures', quoteType: 'FUTURE', symbol: 'SAAPL=F' },
  ],
};
const notFound = () => {
  const err = new Error('Request failed with status code 404');
  err.response = { status: 404, data: { chart: { result: null, error: { code: 'Not Found' } } } };
  return err;
};

beforeEach(() => jest.resetAllMocks());

describe('stock quote without a Finnhub key', () => {
  it('comes from Yahoo\'s chart endpoint, with a browser User-Agent', async () => {
    axios.get.mockResolvedValue({ data: CHART_AAPL });
    const q = await MarketService.getStockQuote('u1', 'aapl');
    expect(q).toMatchObject({
      symbol: 'AAPL', price: 342.37, high: 345.79, low: 338.3, volume: 44703806,
      previousClose: 344.17, change: -1.8, changePercent: '-0.52%', source: 'yahoo',
    });
    const [url, opts] = axios.get.mock.calls[0];
    expect(url).toBe('https://query1.finance.yahoo.com/v8/finance/chart/AAPL');
    expect(opts.headers['User-Agent']).toMatch(/Mozilla/);
  });

  it('turns an unknown symbol into 404, not 503', async () => {
    axios.get.mockRejectedValue(notFound());
    await expect(MarketService.getStockQuote('u1', 'NOTAREALTICKERX')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('still says 503 when Yahoo is down too', async () => {
    axios.get.mockRejectedValue(Object.assign(new Error('socket hang up'), { response: { status: 500 } }));
    await expect(MarketService.getStockQuote('u1', 'AAPL')).rejects.toMatchObject({ statusCode: 503 });
  });
});

describe('symbol search without a Finnhub key', () => {
  it('uses Yahoo\'s search endpoint and keeps only stocks and ETFs', async () => {
    axios.get.mockResolvedValue({ data: SEARCH_APPLE });
    const r = await MarketService.searchSymbol('u1', 'apple');
    expect(r).toEqual([{ symbol: 'AAPL', name: 'Apple Inc.', type: 'Equity', region: 'NASDAQ', currency: null, source: 'yahoo' }]);
  });
});
