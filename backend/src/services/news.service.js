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

// FIX: generate a full page of mock news so pageSize is respected
const mockNews = ({ q, category, country, pageSize }) => {
  const now = Date.now();
  const base = [
    {
      title: 'Universal API Hub adds modular News API support',
      description: 'The new module supports cached headlines, scoped access, and weighted rate limits.',
      source: 'Universal API Hub Labs',
      author: 'Platform Team',
      url: 'https://example.com/news/1',
    },
    {
      title: `Top ${category || 'general'} stories${q ? ` for "${q}"` : ''}`,
      description: 'Mock headlines are returned when no upstream news provider is configured.',
      source: 'Mock Wire',
      author: null,
      url: 'https://example.com/news/2',
    },
    {
      title: 'Global markets rally on strong earnings reports',
      description: 'Tech and energy sectors lead gains as investors eye Fed decision.',
      source: 'Mock Finance',
      author: 'Jane Doe',
      url: 'https://example.com/news/3',
    },
    {
      title: 'Breakthrough in renewable energy storage announced',
      description: 'New battery chemistry promises 10x capacity at half the cost.',
      source: 'Mock Science',
      author: 'Dr. Smith',
      url: 'https://example.com/news/4',
    },
    {
      title: 'Championship finals draw record viewership',
      description: 'Millions tune in as underdogs advance past favorites.',
      source: 'Mock Sports',
      author: null,
      url: 'https://example.com/news/5',
    },
    {
      title: 'New AI model sets benchmark records',
      description: 'Open-source release outperforms proprietary alternatives on key tasks.',
      source: 'Mock Tech',
      author: 'Alex Lee',
      url: 'https://example.com/news/6',
    },
    {
      title: 'Health officials announce new guidelines',
      description: 'Updated recommendations focus on preventative care and screening.',
      source: 'Mock Health',
      author: null,
      url: 'https://example.com/news/7',
    },
    {
      title: 'Space mission returns first images',
      description: 'Data reveals unexpected atmospheric composition on distant moon.',
      source: 'Mock Space',
      author: 'Dr. Patel',
      url: 'https://example.com/news/8',
    },
    {
      title: 'Entertainment industry embraces streaming-first releases',
      description: 'Studios shift strategy as theaters see declining attendance.',
      source: 'Mock Entertainment',
      author: null,
      url: 'https://example.com/news/9',
    },
    {
      title: 'Startup funding rebounds in Q3',
      description: 'Investors return to early-stage bets after cautious first half.',
      source: 'Mock Business',
      author: 'Chris Kim',
      url: 'https://example.com/news/10',
    },
  ];

  const articles = base.slice(0, Math.max(1, pageSize || 10)).map((a, i) => ({
    id: `mock-news-${i + 1}`,
    title: a.title,
    description: a.description,
    source: a.source,
    author: a.author,
    url: a.url,
    imageUrl: null,
    publishedAt: new Date(now - i * 3600000).toISOString(),
  }));

  return {
    source: 'mock',
    query: { q: q || null, category: category || 'general', country, pageSize },
    totalResults: articles.length,
    articles,
  };
};

const NewsService = {
  fetchHeadlines: async ({ userId, q, category, country = 'us', pageSize = 10, page = 1 }) => {
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

        if (payload.articles.length === 0) {
          payload = mockNews(cachePayload);
        }
      } catch (err) {
        logger.error('News upstream request failed, falling back to mock', { error: err.message });
        payload = mockNews(cachePayload);
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