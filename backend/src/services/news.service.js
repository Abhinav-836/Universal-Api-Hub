const axios = require('axios');
const { getRedis, KEYS, TTL } = require('../config/redis');
const { sha256 } = require('../utils/hash');
const logger = require('../utils/logger');

const DEFAULT_NEWS_BASE_URL = (process.env.NEWS_API_BASE_URL || 'https://newsapi.org/v2').replace(/\/$/, '');
const USER_MINUTE_LIMIT = 10;   // requests per minute per user

async function checkUserMinuteLimit(userId) {
  if (!userId) return true;
  const redis = getRedis();
  const key = `rate:user:${userId}:news_minute`;
  const current = await redis.incr(key);
  if (current === 1) await redis.expire(key, 60);
  return current <= USER_MINUTE_LIMIT;
}

const buildCacheKey = (payload) => KEYS.newsCache(sha256(JSON.stringify(payload)));

const normalizeArticles = (articles = []) =>
  articles.slice(0, 25).map((article, index) => ({
    id: article.url || `${article.source?.name || 'news'}-${index}`,
    title: article.title,
    description: article.description,
    source: article.source?.name || 'Unknown',
    author: article.author || null,
    url: article.url,
    imageUrl: article.urlToImage || null,
    publishedAt: article.publishedAt,
  }));

const mockNews = ({ q, category, country, pageSize }) => ({
  source: 'mock',
  query: { q: q || null, category: category || 'general', country, pageSize },
  articles: [
    {
      id: 'mock-news-1',
      title: 'Universal API Hub adds modular News API support',
      description: 'The new module supports cached headlines, scoped access, and weighted rate limits.',
      source: 'Universal API Hub Labs',
      author: 'Platform Team',
      url: 'https://example.com/news/1',
      imageUrl: null,
      publishedAt: new Date().toISOString(),
    },
    {
      id: 'mock-news-2',
      title: `Top ${category || 'general'} stories${q ? ` for "${q}"` : ''}`,
      description: 'Mock headlines are returned when no upstream news provider is configured.',
      source: 'Mock Wire',
      author: null,
      url: 'https://example.com/news/2',
      imageUrl: null,
      publishedAt: new Date(Date.now() - 3600000).toISOString(),
    },
  ].slice(0, pageSize),
});

const NewsService = {
  fetchHeadlines: async ({ userId, q, category, country = 'us', pageSize = 10, page = 1 }) => {
    // Per‑minute limit check
    if (!(await checkUserMinuteLimit(userId))) {
      const error = new Error('NewsAPI per‑minute limit exceeded. Please wait.');
      error.statusCode = 429;
      throw error;
    }

    const cachePayload = { q, category, country, pageSize, page };
    const cacheKey = buildCacheKey(cachePayload);
    const redis = getRedis();

    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (err) {
      logger.warn('News cache read failed', { error: err.message });
    }

    let payload;
    if (process.env.NEWS_API_KEY) {
      try {
        const response = await axios.get(`${DEFAULT_NEWS_BASE_URL}/top-headlines`, {
          params: {
            q: q || undefined,
            category: category || undefined,
            country: country || undefined,
            pageSize,
            page,
          },
          headers: {
            'X-Api-Key': process.env.NEWS_API_KEY,
          },
          timeout: 8000,
        });

        payload = {
          source: 'newsapi',
          query: cachePayload,
          totalResults: response.data.totalResults || 0,
          articles: normalizeArticles(response.data.articles || []),
        };
      } catch (err) {
        logger.error('News upstream request failed', { error: err.message });
        const error = new Error('Unable to fetch news right now');
        error.statusCode = 502;
        throw error;
      }
    } else {
      payload = mockNews(cachePayload);
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