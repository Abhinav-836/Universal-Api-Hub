const axios = require('axios');
const { getRedis, KEYS, TTL } = require('../config/redis');
const { sha256 } = require('../utils/hash');
const logger = require('../utils/logger');

const DEFAULT_SPORTS_BASE_URL = (process.env.SPORTS_API_BASE_URL || '').replace(/\/$/, '');
const SUPPORTED_LEAGUES = ['soccer', 'football', 'basketball', 'cricket', 'baseball'];
const USER_MINUTE_LIMIT = 30;   // requests per minute per user

async function checkUserMinuteLimit(userId) {
  if (!userId) return true;
  const redis = getRedis();
  const key = `rate:user:${userId}:sports_minute`;
  const current = await redis.incr(key);
  if (current === 1) await redis.expire(key, 60);
  return current <= USER_MINUTE_LIMIT;
}

const buildCacheKey = (payload) => KEYS.sportsCache(sha256(JSON.stringify(payload)));

const mockEvents = ({ league, team, date }) => [
  {
    id: 'mock-sports-1',
    league,
    homeTeam: team || 'Universal FC',
    awayTeam: 'Platform United',
    startTime: `${date}T18:00:00Z`,
    status: 'scheduled',
    venue: 'API Arena',
    score: null,
  },
  {
    id: 'mock-sports-2',
    league,
    homeTeam: 'Cloud City',
    awayTeam: team || 'Integration Town',
    startTime: `${date}T20:30:00Z`,
    status: 'scheduled',
    venue: 'Redis Stadium',
    score: null,
  },
];

const normalizeSportsResponse = (data, fallbackQuery) => {
  const candidates = data.events || data.games || data.response || [];
  const rawEvents = Array.isArray(candidates) ? candidates : [];
  return {
    source: 'upstream',
    query: fallbackQuery,
    events: rawEvents.slice(0, fallbackQuery.pageSize).map((event, index) => ({
      id: event.id || event.fixture?.id || `sports-${index}`,
      league: event.league?.name || event.competition?.name || fallbackQuery.league,
      homeTeam: event.homeTeam?.name || event.teams?.home?.name || event.home?.name || 'TBD',
      awayTeam: event.awayTeam?.name || event.teams?.away?.name || event.away?.name || 'TBD',
      startTime: event.startTime || event.fixture?.date || event.commence_time || null,
      status: event.status?.short || event.status || event.fixture?.status?.short || 'scheduled',
      venue: event.venue?.name || event.fixture?.venue?.name || null,
      score: event.score || event.goals || null,
    })),
  };
};

const SportsService = {
  fetchSchedule: async ({ userId, league = 'soccer', team, date, pageSize = 10 }) => {
    // Per‑minute limit check
    if (!(await checkUserMinuteLimit(userId))) {
      const error = new Error('Sportmonks per‑minute limit exceeded. Please wait.');
      error.statusCode = 429;
      throw error;
    }

    const safeLeague = SUPPORTED_LEAGUES.includes(league) ? league : 'soccer';
    const safeDate = date || new Date().toISOString().slice(0, 10);
    const query = { league: safeLeague, team: team || null, date: safeDate, pageSize };
    const cacheKey = buildCacheKey(query);
    const redis = getRedis();

    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (err) {
      logger.warn('Sports cache read failed', { error: err.message });
    }

    let payload;
    if (process.env.SPORTS_API_KEY && DEFAULT_SPORTS_BASE_URL) {
      try {
        const response = await axios.get(DEFAULT_SPORTS_BASE_URL, {
          params: {
            league: safeLeague,
            team: team || undefined,
            date: safeDate,
            limit: pageSize,
          },
          headers: {
            Authorization: `Bearer ${process.env.SPORTS_API_KEY}`,
            'X-API-Key': process.env.SPORTS_API_KEY,
          },
          timeout: 8000,
        });

        payload = normalizeSportsResponse(response.data || {}, query);
      } catch (err) {
        logger.error('Sports upstream request failed', { error: err.message });
        const error = new Error('Unable to fetch sports data right now');
        error.statusCode = 502;
        throw error;
      }
    } else {
      payload = {
        source: 'mock',
        query,
        events: mockEvents(query),
      };
    }

    try {
      await redis.set(cacheKey, JSON.stringify(payload), 'EX', TTL.ONE_MINUTE);
    } catch (err) {
      logger.warn('Sports cache write failed', { error: err.message });
    }

    return payload;
  },
};

module.exports = SportsService;