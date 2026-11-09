// backend/src/services/news.service.js
const axios = require('axios');
const { getRedis, KEYS, TTL } = require('../config/redis');
const { sha256 } = require('../utils/hash');
const logger = require('../utils/logger');

const DEFAULT_NEWS_BASE_URL = (process.env.NEWS_API_BASE_URL || 'https://newsapi.org/v2').replace(/\/$/, '');
const USER_MINUTE_LIMIT = 10;

// ── Provider ────────────────────────────────────────────────────
// NewsAPI's free "Developer" plan may only be used for development, not in
// production, so it is used ONLY when NEWS_PROVIDER=newsapi is set (meaning
// you have a paid NewsAPI plan). Otherwise headlines come from GDELT: open
// data, no key, free for any use, but limited to one request every 5
// seconds per server — hence the long cache and the request spacing below.
const provider = () =>
  String(process.env.NEWS_PROVIDER || 'gdelt').toLowerCase() === 'newsapi' && process.env.NEWS_API_KEY
    ? 'newsapi'
    : 'gdelt';

const GDELT_URL = 'https://api.gdeltproject.org/api/v2/doc/doc';
const GDELT_GAP_MS = 5500;      // GDELT asks for at most one request per 5 s
const GDELT_MAX_WAIT_MS = 20000; // give up (503) rather than queue longer than this
const GDELT_CACHE_SECONDS = 15 * 60;

const CATEGORY_TERMS = {
  business: 'business', technology: 'technology', sports: 'sports', health: 'health',
  science: 'science', entertainment: 'entertainment', general: null,
};
// GDELT filters by country name; ISO codes for the common ones.
const COUNTRY_NAMES = {
  us: 'unitedstates', in: 'india', gb: 'unitedkingdom', uk: 'unitedkingdom', au: 'australia',
  ca: 'canada', de: 'germany', fr: 'france', jp: 'japan', cn: 'china', br: 'brazil',
  sg: 'singapore', ae: 'unitedarabemirates', za: 'southafrica', nz: 'newzealand', ie: 'ireland',
};

let gdeltNextSlot = 0;
/** Wait for our turn so requests to GDELT are at least GDELT_GAP_MS apart. */
async function gdeltTurn() {
  const now = Date.now();
  const at = Math.max(now, gdeltNextSlot);
  if (at - now > GDELT_MAX_WAIT_MS) {
    throw Object.assign(new Error('News is busy right now. Please retry in a few seconds.'), {
      statusCode: 503,
      retryAfter: Math.ceil((at - now) / 1000),
    });
  }
  gdeltNextSlot = at + GDELT_GAP_MS;
  if (at > now) await new Promise((r) => setTimeout(r, at - now));
}

const cleanTerms = (q) =>
  String(q || '')
    .replace(/[^\p{L}\p{N}\s.-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);

function gdeltQuery({ q, category, country }) {
  const parts = [];
  const terms = cleanTerms(q);
  if (terms) parts.push(terms.includes(' ') ? `"${terms}"` : terms);
  const cat = CATEGORY_TERMS[String(category || '').toLowerCase()];
  if (cat) parts.push(cat);
  if (!parts.length) parts.push('news');
  const c = COUNTRY_NAMES[String(country || '').toLowerCase()];
  if (c) parts.push(`sourcecountry:${c}`);
  parts.push('sourcelang:english');
  return parts.join(' ');
}

// "20261109T083000Z" → ISO
const gdeltDate = (s) => {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(String(s || ''));
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : null;
};

async function fetchGdelt({ q, category, country, pageSize, page }) {
  await gdeltTurn();
  const want = Math.min(100, Math.max(1, pageSize) * Math.max(1, page));
  const { data } = await axios.get(GDELT_URL, {
    params: { query: gdeltQuery({ q, category, country }), mode: 'artlist', format: 'json', maxrecords: want, sort: 'datedesc', timespan: '3d' },
    timeout: 10000,
    responseType: 'text',
    transformResponse: (x) => x,
  });
  let body;
  try {
    body = JSON.parse(data);
  } catch {
    // GDELT answers in plain text when it's throttling or the query is odd.
    if (/limit requests/i.test(String(data))) {
      gdeltNextSlot = Date.now() + 10000;
      throw Object.assign(new Error('News is busy right now. Please retry in a few seconds.'), { statusCode: 503 });
    }
    body = { articles: [] };
  }
  const all = (body.articles || []).filter((a) => a.title && a.url);
  const slice = all.slice((Math.max(1, page) - 1) * pageSize, Math.max(1, page) * pageSize);
  return {
    source: 'gdelt',
    totalResults: all.length,
    articles: slice.map((a) => ({
      id: a.url,
      title: a.title,
      description: null,
      source: a.domain || 'Unknown',
      author: null,
      url: a.url,
      imageUrl: a.socialimage || null,
      publishedAt: gdeltDate(a.seendate),
    })),
  };
}

async function checkUserMinuteLimit(userId) {
  if (!userId) return true;
  try {
    const redis = getRedis();
    const key = `rate:user:${userId}:news_minute`;
    const current = await redis.incr(key);
    if (current === 1) await redis.expire(key, 60);
    return current <= USER_MINUTE_LIMIT;
  } catch (_) {
    return true;
  }
}

const buildCacheKey = (payload) => KEYS.newsCache(sha256(JSON.stringify(payload)));

const normalizeArticles = (articles = []) =>
  articles
    .filter((a) => a.title && a.title !== '[Removed]')
    .slice(0, 25)
    .map((article, index) => ({
      id: article.url || `${article.source?.name || 'news'}-${index}`,
      title: article.title,
      description: article.description,
      source: article.source?.name || 'Unknown',
      author: article.author || null,
      url: article.url,
      imageUrl: article.urlToImage || null,
      publishedAt: article.publishedAt,
    }));

const NewsService = {
  fetchHeadlines: async ({ userId, q, category, country = 'us', pageSize = 10, page = 1 }) => {
    if (!(await checkUserMinuteLimit(userId))) {
      const error = new Error('News API per-minute limit exceeded. Please wait.');
      error.statusCode = 429;
      throw error;
    }

    const cachePayload = { q, category, country, pageSize, page };

    const which = provider();
    const cacheKey = buildCacheKey({ ...cachePayload, provider: which });
    const redis = getRedis();

    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (err) {
      logger.warn('News cache read failed', { error: err.message });
    }

    let payload;
    if (which === 'gdelt') {
      try {
        const r = await fetchGdelt({ q, category, country, pageSize, page });
        payload = { ...r, query: cachePayload };
      } catch (err) {
        if (err.statusCode === 503) throw err;
        logger.error('GDELT request failed', { error: err.message, status: err.response?.status });
        throw Object.assign(new Error('News provider is temporarily unavailable. Please retry shortly.'), { statusCode: 503 });
      }
      try {
        await redis.set(cacheKey, JSON.stringify(payload), 'EX', GDELT_CACHE_SECONDS);
      } catch (err) {
        logger.warn('News cache write failed', { error: err.message });
      }
      return payload;
    }

    try {
      const response = await axios.get(`${DEFAULT_NEWS_BASE_URL}/top-headlines`, {
        params: {
          q: q || undefined,
          category: category || undefined,
          country: country || undefined,
          pageSize,
          page,
        },
        headers: { 'X-Api-Key': process.env.NEWS_API_KEY },
        timeout: 8000,
      });

      // FIX: zero results used to be replaced with fake headlines. An empty
      // list is a valid answer.
      payload = {
        source: 'newsapi',
        query: cachePayload,
        totalResults: response.data.totalResults || 0,
        articles: normalizeArticles(response.data.articles || []),
      };
    } catch (err) {
      // FIX: upstream failures used to silently return mock headlines with
      // success:true. Now it's a 503 (quota refunded) and nothing is cached.
      logger.error('News upstream request failed', {
        error: err.message,
        status: err.response?.status,
        code: err.response?.data?.code,
      });
      const error = new Error('News provider is temporarily unavailable. Please retry shortly.');
      error.statusCode = 503;
      throw error;
    }

    try {
      await redis.set(cacheKey, JSON.stringify(payload), 'EX', TTL.FIVE_MINUTES);
    } catch (err) {
      logger.warn('News cache write failed', { error: err.message });
    }

    return payload;
  },
};

module.exports = NewsService;
module.exports._internals = { gdeltQuery, gdeltDate, provider };