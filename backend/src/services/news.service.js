// backend/src/services/news.service.js
const axios = require('axios');
const { getRedis, KEYS, TTL } = require('../config/redis');
const { sha256 } = require('../utils/hash');
const logger = require('../utils/logger');

const DEFAULT_NEWS_BASE_URL = (process.env.NEWS_API_BASE_URL || 'https://newsapi.org/v2').replace(/\/$/, '');
const USER_MINUTE_LIMIT = 10;

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

// Only used when NEWS_API_KEY is not configured (demo mode).
const mockNews = ({ q, category, country, pageSize }) => {
  const now = Date.now();
  const base = [
    ['Universal API Hub adds modular News API support', 'The new module supports cached headlines, scoped access, and weighted rate limits.', 'Universal API Hub Labs'],
    [`Top ${category || 'general'} stories${q ? ` for "${q}"` : ''}`, 'Mock headlines are returned when no upstream news provider is configured.', 'Mock Wire'],
    ['Global markets rally on strong earnings reports', 'Tech and energy sectors lead gains.', 'Mock Finance'],
    ['Breakthrough in renewable energy storage announced', 'New battery chemistry promises higher capacity.', 'Mock Science'],
    ['Championship finals draw record viewership', 'Underdogs advance past favorites.', 'Mock Sports'],
  ];
  const articles = base.slice(0, Math.max(1, pageSize || 5)).map(([title, description, source], i) => ({
    id: `mock-news-${i + 1}`,
    title,
    description,
    source,
    author: null,
    url: `https://example.com/news/${i + 1}`,
    imageUrl: null,
    publishedAt: new Date(now - i * 3600000).toISOString(),
  }));
  return {
    source: 'mock',
    notice: 'Demo data — no news provider is configured.',
    query: { q: q || null, category: category || 'general', country, pageSize },
    totalResults: articles.length,
    articles,
  };
};

const NewsService = {
  fetchHeadlines: async ({ userId, q, category, country = 'us', pageSize = 10, page = 1 }) => {
    if (!(await checkUserMinuteLimit(userId))) {
      const error = new Error('News API per-minute limit exceeded. Please wait.');
      error.statusCode = 429;
      throw error;
    }

    const cachePayload = { q, category, country, pageSize, page };

    if (!process.env.NEWS_API_KEY) {
      return mockNews(cachePayload);
    }

    const cacheKey = buildCacheKey(cachePayload);
    const redis = getRedis();

    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (err) {
      logger.warn('News cache read failed', { error: err.message });
    }

    let payload;
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