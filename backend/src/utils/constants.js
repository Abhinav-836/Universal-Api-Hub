// backend/src/utils/constants.js

// FIX: the advertised model lists were hard-coded and did not match the
// models llm.service.js actually calls (which come from .env). Both now
// read the same env vars, so /plans shows what users really get.
const modelsFromEnv = (name, fallback) =>
  (process.env[name] || fallback).split(',').map((m) => m.trim()).filter(Boolean);

const PLANS = {
  free: {
    name: 'Free',
    dailyLimit: 10,
    apiSlots: 2,
    switchesPerDay: 2,
    allowedTiers: ['free'],
    alphaVantageCallsPerMin: 5,
    yahooFinanceCallsPerMin: 10,
    get llmModels() {
      return modelsFromEnv('OPENROUTER_MODEL_FREE', 'meta-llama/llama-3.3-70b-instruct:free');
    },
  },
  pro: {
    name: 'Pro',
    dailyLimit: 50,
    apiSlots: 8,
    switchesPerDay: 5,
    allowedTiers: ['free', 'pro'],
    alphaVantageCallsPerMin: 15,
    yahooFinanceCallsPerMin: 20,
    get llmModels() {
      return modelsFromEnv('OPENROUTER_MODEL_PRO', 'openai/gpt-4o-mini');
    },
  },
  premium: {
    name: 'Premium',
    dailyLimit: 200,
    apiSlots: 10, // not enforced: premium is auto-granted every API
    switchesPerDay: Infinity,
    allowedTiers: ['free', 'pro', 'premium'],
    alphaVantageCallsPerMin: 25,
    yahooFinanceCallsPerMin: 30,
    get llmModels() {
      return modelsFromEnv('OPENROUTER_MODEL_ALL', 'openai/gpt-4o');
    },
  },
};

// FIX: these disagreed with the database (chat 2 vs 3, llm-chat 3 vs 5,
// news/sports 1 vs 2). The DB `cost_weight` column is what is actually
// charged (see middleware/apiAccess.js); these now mirror database/seed.sql
// and are only a fallback.
const API_COST_WEIGHTS = {
  chat: 3,
  'llm-chat': 5,
  'image-analyze': 5,
  weather: 1,
  translate: 2,
  sentiment: 2,
  summarize: 3,
  geocode: 1,
  news: 2,
  sports: 2,
  'stock-quote': 2,
  'stock-search': 1,
  forex: 2,
  crypto: 2,
};

const RATE_LIMIT = {
  WARNING_THRESHOLD: 0.8,
};

const MAX_API_KEYS_PER_USER = 5;
const KEY_TYPES = ['dev', 'prod', 'test'];

const HTTP = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  TOO_MANY: 429,
  SERVER_ERROR: 500,
};

const CACHE_TTL = {
  API_KEY: 300,
  USER: 300,
  APIS: 3600,
  USER_APIS: 300,
};

module.exports = { PLANS, API_COST_WEIGHTS, RATE_LIMIT, MAX_API_KEYS_PER_USER, KEY_TYPES, HTTP, CACHE_TTL };