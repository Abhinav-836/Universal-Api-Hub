// backend/src/controllers/api.controller.js
const { validationResult } = require('express-validator');
const ApiKeyService = require('../services/apiKey.service');
const LlmService = require('../services/llm.service');
const { getRedis } = require('../config/redis');
const axios = require('axios');
const { withUsageLog } = require('../utils/apiHandler');

// ============================================================
// API KEY MANAGEMENT CONTROLLER (unchanged)
// ============================================================
const ApiKeyController = {
  list: async (req, res) => {
    try {
      const keys = await ApiKeyService.listForUser(req.user.id);
      res.json({ success: true, keys });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  },

  create: async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    try {
      const { label, keyType, scopedApis, expiresAt } = req.body;
      const key = await ApiKeyService.create({
        userId: req.user.id,
        label: label || 'My Key',
        keyType: keyType || 'dev',
        scopedApis: Array.isArray(scopedApis) && scopedApis.length ? scopedApis : null,
        expiresAt: expiresAt || null,
      });
      res.status(201).json({
        success: true,
        message: '⚠ Store the rawKey securely — it will NOT be shown again.',
        key,
      });
    } catch (err) {
      res.status(err.statusCode || 500).json({ success: false, error: err.message });
    }
  },

  revoke: async (req, res) => {
    try {
      await ApiKeyService.revoke(req.params.keyId, req.user.id);
      res.json({ success: true, message: 'API key revoked' });
    } catch (err) {
      res.status(err.statusCode || 500).json({ success: false, error: err.message });
    }
  },

  updateScopes: async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    try {
      const { scopedApis } = req.body;
      const updated = await ApiKeyService.updateScopes(req.params.keyId, req.user.id, scopedApis);
      res.json({ success: true, key: updated });
    } catch (err) {
      res.status(err.statusCode || 500).json({ success: false, error: err.message });
    }
  },
};

// ============================================================
// Per‑minute helper for Weather (OpenWeatherMap free tier: 60/min)
// ============================================================
const WEATHER_USER_MINUTE_LIMIT = 30;

async function checkWeatherMinuteLimit(userId) {
  if (!userId) return true;
  const redis = getRedis();
  const key = `rate:user:${userId}:weather_minute`;
  const current = await redis.incr(key);
  if (current === 1) await redis.expire(key, 60);
  return current <= WEATHER_USER_MINUTE_LIMIT;
}

// ============================================================
// UPDATED chatHandler – uses OpenRouter via LlmService
// ============================================================
const chatHandler = withUsageLog(async (req, res) => {
  const { message, system } = req.body;
  if (!message?.trim()) {
    return res.status(400).json({ success: false, error: '`message` field is required' });
  }

  const result = await LlmService.chat({
    message,
    system,
    temperature: 0.7,
    maxTokens: 500,
  });

  res.json({
    success: true,
    reply: result.reply,
    model: result.model,
    usage: result.usage,
    finishReason: result.finishReason,
    source: result.source,
  });
});

// ============================================================
// UPDATED weatherHandler – with per‑minute throttling
// ============================================================
const weatherHandler = withUsageLog(async (req, res) => {
  const { city, lat, lon, units = 'metric' } = req.query;

  if (!city && (!lat || !lon)) {
    return res.status(400).json({ success: false, error: 'Provide `city` or `lat` + `lon`' });
  }

  // Per‑minute limit check
  if (!(await checkWeatherMinuteLimit(req.user.id))) {
    return res.status(429).json({
      success: false,
      error: 'Weather API per‑minute limit exceeded. Please wait.',
    });
  }

  if (process.env.WEATHER_API_KEY) {
    const location = city ? `q=${encodeURIComponent(city)}` : `lat=${lat}&lon=${lon}`;
    const resp = await axios.get(
      `https://api.openweathermap.org/data/2.5/weather?${location}&units=${units}&appid=${process.env.WEATHER_API_KEY}`
    );
    return res.json({ success: true, weather: resp.data, source: 'openweathermap' });
  }

  // Mock response (no limit on mock)
  const unitLabel = units === 'imperial' ? '°F' : '°C';
  const mockTemps = { metric: { cur: 18, feels: 16, min: 13, max: 22 }, imperial: { cur: 64, feels: 61, min: 55, max: 72 } };
  const t = mockTemps[units] || mockTemps.metric;

  res.json({
    success: true,
    source: 'mock',
    weather: {
      location: city || `${lat}, ${lon}`,
      country: 'GB',
      temperature: { current: t.cur, feels_like: t.feels, min: t.min, max: t.max, unit: unitLabel },
      description: 'Partly cloudy with light south-westerly breeze',
      humidity: 72,
      pressure: 1013,
      visibility: 10000,
      wind: { speed: 5.1, direction: 'SW', gust: 8.3 },
      clouds: 45,
      sunrise: '06:12',
      sunset: '20:47',
      timestamp: new Date().toISOString(),
    },
  });
});

// ============================================================
// Other handlers (unchanged except imports)
// ============================================================
const imageAnalyzeHandler = withUsageLog(async (req, res) => {
  const { imageUrl, imageBase64 } = req.body;
  if (!imageUrl && !imageBase64) {
    return res.status(400).json({ success: false, error: 'Provide `imageUrl` or `imageBase64`' });
  }
  const mockLabels = [
    { label: 'Technology', confidence: 0.97 },
    { label: 'Computer', confidence: 0.94 },
    { label: 'Screen', confidence: 0.91 },
    { label: 'Office', confidence: 0.83 },
    { label: 'Desk', confidence: 0.79 },
  ];
  res.json({
    success: true,
    source: imageUrl || 'base64_input',
    analysis: {
      description: 'A modern workspace with computing equipment and digital displays.',
      labels: mockLabels,
      dominant_colors: ['#1a2744', '#4a90d9', '#f5a623', '#7ed321'],
      text_detected: null,
      faces_detected: 0,
      safe_search: {
        adult: 'VERY_UNLIKELY',
        violence: 'VERY_UNLIKELY',
        racy: 'VERY_UNLIKELY',
      },
      confidence: 0.94,
    },
    model: 'mock-vision-v1',
  });
});

const translateHandler = withUsageLog(async (req, res) => {
  const { text, targetLanguage, sourceLanguage = 'auto' } = req.body;
  if (!text?.trim()) return res.status(400).json({ success: false, error: '`text` is required' });
  if (!targetLanguage?.trim()) return res.status(400).json({ success: false, error: '`targetLanguage` is required' });
  const mockTranslations = {
    es: `[ES] ${text}`, fr: `[FR] ${text}`, de: `[DE] ${text}`,
    ja: `[JA] ${text}`, zh: `[ZH] ${text}`, ar: `[AR] ${text}`,
  };
  res.json({
    success: true,
    translation: {
      original: text,
      translated: mockTranslations[targetLanguage] || `[${targetLanguage.toUpperCase()}] ${text}`,
      sourceLanguage: sourceLanguage === 'auto' ? 'en' : sourceLanguage,
      targetLanguage,
      confidence: 0.98,
    },
    model: 'mock-translate-v1',
    source: 'mock',
  });
});

const sentimentHandler = withUsageLog(async (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ success: false, error: '`text` is required' });
  const lower = text.toLowerCase();
  const positiveWords = ['great', 'good', 'excellent', 'amazing', 'love', 'fantastic', 'wonderful', 'happy'];
  const negativeWords = ['bad', 'terrible', 'awful', 'hate', 'horrible', 'worst', 'poor', 'disappointing'];
  const posCount = positiveWords.filter(w => lower.includes(w)).length;
  const negCount = negativeWords.filter(w => lower.includes(w)).length;
  const score = (posCount - negCount) / Math.max(posCount + negCount, 1);
  const sentiment = score > 0.1 ? 'positive' : score < -0.1 ? 'negative' : 'neutral';
  const magnitude = Math.abs(score);
  res.json({
    success: true,
    sentiment: {
      label: sentiment,
      score: parseFloat(score.toFixed(3)),
      magnitude: parseFloat(magnitude.toFixed(3)),
      breakdown: { positive: posCount, negative: negCount, neutral: text.split(' ').length - posCount - negCount },
      emotions: {
        joy: sentiment === 'positive' ? 0.7 : 0.1,
        sadness: sentiment === 'negative' ? 0.6 : 0.05,
        anger: sentiment === 'negative' ? 0.3 : 0.02,
        surprise: 0.1,
      },
    },
    text_length: text.length,
    model: 'mock-sentiment-v1',
  });
});

const summarizeHandler = withUsageLog(async (req, res) => {
  const { text, maxLength = 150, style = 'paragraph' } = req.body;
  if (!text?.trim()) return res.status(400).json({ success: false, error: '`text` is required' });
  if (text.length < 100) return res.status(400).json({ success: false, error: 'Text too short to summarize (min 100 characters)' });
  let summary = text.slice(0, maxLength);
  const lastDot = summary.lastIndexOf('. ');
  if (lastDot > 50) summary = summary.slice(0, lastDot + 1);
  const keyPoints = text.split('. ').slice(0, 3).map(s => s.trim()).filter(Boolean);
  res.json({
    success: true,
    summary: {
      text: summary + (text.length > maxLength ? ' [...]' : ''),
      key_points: keyPoints,
      word_count: { original: text.split(' ').length, summary: summary.split(' ').length },
      reduction: `${Math.round((1 - summary.length / text.length) * 100)}%`,
      style,
    },
    model: 'mock-summarizer-v1',
  });
});

const geocodeHandler = withUsageLog(async (req, res) => {
  const { address, lat, lon } = req.query;
  if (!address && (!lat || !lon)) {
    return res.status(400).json({ success: false, error: 'Provide `address` or `lat` + `lon`' });
  }
  if (address) {
    res.json({
      success: true,
      type: 'forward',
      query: address,
      result: {
        formatted_address: `${address}, United Kingdom`,
        latitude: 51.5074,
        longitude: -0.1278,
        accuracy: 'rooftop',
        components: { country: 'United Kingdom', city: 'London', postcode: 'EC1A 1BB' },
        place_id: 'mock_place_ChIJdd4hrwug2EcRmSrV3Vo6llI',
      },
      source: 'mock',
    });
  } else {
    res.json({
      success: true,
      type: 'reverse',
      query: { lat: parseFloat(lat), lon: parseFloat(lon) },
      result: {
        formatted_address: `${parseFloat(lat).toFixed(4)}, ${parseFloat(lon).toFixed(4)} — London, UK`,
        components: { country: 'United Kingdom', city: 'London', road: 'Whitehall', postcode: 'SW1A 2AA' },
        place_id: 'mock_place_reverse_001',
      },
      source: 'mock',
    });
  }
});

module.exports = {
  ApiKeyController,
  chatHandler,
  imageAnalyzeHandler,
  weatherHandler,
  translateHandler,
  sentimentHandler,
  summarizeHandler,
  geocodeHandler,
};