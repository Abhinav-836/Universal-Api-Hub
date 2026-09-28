// backend/src/utils/constants.js

const PLANS = {
  free: {
    name: 'Free',
    dailyLimit: 10,
    apiSlots: 2,
    switchesPerDay: 2,
    allowedTiers: ['free'],
    alphaVantageCallsPerMin: 5,
    yahooFinanceCallsPerMin: 10,
    llmModels: [
      'mistralai/mistral-7b-instruct',
      'deepseek/deepseek-chat',
      'meta-llama/llama-3-8b-instruct',
      'google/gemini-flash-1.5',
      'microsoft/phi-3-mini-128k-instruct'
    ],
  },
  pro: {
    name: 'Pro',
    dailyLimit: 50,
    apiSlots: 8,
    switchesPerDay: 5,
    allowedTiers: ['free', 'pro'],
    alphaVantageCallsPerMin: 15,
    yahooFinanceCallsPerMin: 20,
    llmModels: [
      'openai/gpt-4o-mini',
      'openai/gpt-4-turbo',
      'anthropic/claude-3.5-sonnet',
      'anthropic/claude-3-haiku',
      'google/gemini-pro-1.5',
      'meta-llama/llama-3-70b-instruct'
    ],
  },
  premium: {
    name: 'Premium',
    dailyLimit: 200,
    apiSlots: 10,
    switchesPerDay: Infinity,
    allowedTiers: ['free', 'pro', 'premium'],
    alphaVantageCallsPerMin: 25,
    yahooFinanceCallsPerMin: 30,
    llmModels: 'all',
  },
};

const API_COST_WEIGHTS = {
  chat: 2,
  'llm-chat': 3,
  'image-analyze': 5,
  weather: 1,
  translate: 2,
  sentiment: 2,
  summarize: 3,
  geocode: 1,
  news: 1,
  sports: 1,
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