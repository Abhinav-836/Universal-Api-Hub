// backend/src/services/sports.service.js
const axios = require('axios');
const { getRedis, KEYS, TTL } = require('../config/redis');
const { sha256 } = require('../utils/hash');
const logger = require('../utils/logger');

// e.g. https://api.sportsdata.io/v3  (a trailing slash is fine)
const SPORTS_BASE_URL = (process.env.SPORTS_API_BASE_URL || 'https://api.sportsdata.io/v3').replace(/\/+$/, '');
const SUPPORTED_LEAGUES = ['soccer', 'football', 'basketball', 'cricket', 'baseball'];
const USER_MINUTE_LIMIT = 30;

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const isoDate = (d) => d;                                   // 2026-10-22
const monDate = (d) => {                                    // 2026-OCT-22
  const [y, m, day] = d.split('-');
  return `${y}-${MONTHS[parseInt(m, 10) - 1]}-${day}`;
};

// FIX: the old code sent GET <base>?league=...&date=... which is not a
// sportsdata.io endpoint, so every call failed and fell back to mock data.
// sportsdata.io is path-based: /{sport}/scores/json/GamesByDate/{date}.
// Cricket has no sportsdata.io feed, so it stays in demo mode.
const SPORTSDATA_ROUTES = {
  soccer:     { path: (d) => `soccer/scores/json/GamesByDate/${isoDate(d)}` },
  basketball: { path: (d) => `nba/scores/json/GamesByDate/${monDate(d)}` },
  baseball:   { path: (d) => `mlb/scores/json/GamesByDate/${monDate(d)}` },
  football:   { path: (d) => `nfl/scores/json/ScoresByDate/${monDate(d)}` },
};

async function checkUserMinuteLimit(userId) {
  if (!userId) return true;
  try {
    const redis = getRedis();
    const key = `rate:user:${userId}:sports_minute`;
    const current = await redis.incr(key);
    if (current === 1) await redis.expire(key, 60);
    return current <= USER_MINUTE_LIMIT;
  } catch (_) {
    return true;
  }
}

const buildCacheKey = (payload) => KEYS.sportsCache(sha256(JSON.stringify(payload)));

const mockEvents = ({ league, team, date, pageSize = 10 }) => {
  const teams = [
    ['Universal FC', 'Platform United'],
    ['Cloud City', 'Integration Town'],
    ['Redis Rangers', 'Cache County'],
    ['API Athletic', 'Endpoint FC'],
    ['Hub United', 'Gateway City'],
  ];
  return teams.slice(0, Math.max(1, Math.min(pageSize, teams.length))).map(([home, away], i) => ({
    id: `mock-sports-${i + 1}`,
    league,
    homeTeam: i === 0 && team ? team : home,
    awayTeam: away,
    startTime: `${date}T${String(18 + (i % 4)).padStart(2, '0')}:00:00Z`,
    status: 'scheduled',
    venue: ['API Arena', 'Redis Stadium', 'Cloud Dome', 'Cache Park'][i % 4],
    score: null,
  }));
};

const pick = (...vals) => vals.find((v) => v !== undefined && v !== null && v !== '') ?? null;

const normalizeEvent = (e, league) => {
  const homeScore = pick(e.HomeTeamScore, e.HomeTeamRuns, e.HomeScore);
  const awayScore = pick(e.AwayTeamScore, e.AwayTeamRuns, e.AwayScore);
  return {
    id: pick(e.GameId, e.GameID, e.GameKey, e.ScoreID),
    league,
    homeTeam: pick(e.HomeTeamName, e.HomeTeam, 'TBD'),
    awayTeam: pick(e.AwayTeamName, e.AwayTeam, 'TBD'),
    startTime: pick(e.DateTimeUTC, e.DateTime, e.Date, e.Day),
    status: pick(e.Status, 'Scheduled'),
    venue: pick(e.VenueName, e.StadiumDetails?.Name, e.StadiumID != null ? `Stadium ${e.StadiumID}` : null),
    score: homeScore != null || awayScore != null ? { home: homeScore, away: awayScore } : null,
  };
};

const matchesTeam = (ev, team) => {
  if (!team) return true;
  const t = team.toLowerCase();
  return [ev.homeTeam, ev.awayTeam].some((n) => String(n || '').toLowerCase().includes(t));
};

const SportsService = {
  fetchSchedule: async ({ userId, league = 'soccer', team, date, pageSize = 10 }) => {
    if (!(await checkUserMinuteLimit(userId))) {
      const error = new Error('Sports API per-minute limit exceeded. Please wait.');
      error.statusCode = 429;
      throw error;
    }

    const safeLeague = SUPPORTED_LEAGUES.includes(league) ? league : 'soccer';
    const safeDate = (date || new Date().toISOString()).slice(0, 10);
    const query = { league: safeLeague, team: team || null, date: safeDate, pageSize };
    const route = SPORTSDATA_ROUTES[safeLeague];

    // Demo mode: no key configured, or no upstream feed for this league.
    if (!process.env.SPORTS_API_KEY || !route) {
      return {
        source: 'mock',
        notice: route
          ? 'Demo data — no sports provider is configured.'
          : `Demo data — live ${safeLeague} data is not available yet.`,
        query,
        events: mockEvents(query),
      };
    }

    const cacheKey = buildCacheKey(query);
    const redis = getRedis();
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (err) {
      logger.warn('Sports cache read failed', { error: err.message });
    }

    let payload;
    try {
      const url = `${SPORTS_BASE_URL}/${route.path(safeDate)}`;
      const response = await axios.get(url, {
        headers: { 'Ocp-Apim-Subscription-Key': process.env.SPORTS_API_KEY },
        timeout: 8000,
      });
      const raw = Array.isArray(response.data) ? response.data : [];
      const events = raw
        .map((e) => normalizeEvent(e, safeLeague))
        .filter((ev) => matchesTeam(ev, team))
        .slice(0, pageSize);

      payload = { source: 'sportsdata', query, events };
    } catch (err) {
      logger.error('Sports upstream request failed', {
        error: err.message,
        status: err.response?.status,
        league: safeLeague,
      });
      const error = new Error('Sports provider is temporarily unavailable. Please retry shortly.');
      error.statusCode = 503;
      throw error;
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