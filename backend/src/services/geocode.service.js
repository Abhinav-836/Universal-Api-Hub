// backend/src/services/geocode.service.js
//
// Forward and reverse geocoding via OpenWeather's Geocoding API, using the
// same WEATHER_API_KEY as the weather endpoint (included in OpenWeather's free
// plan). Results are city / town level, not street addresses.
const axios = require('axios');
const logger = require('../utils/logger');

const BASE_URL = 'https://api.openweathermap.org/geo/1.0';

const isConfigured = () => !!process.env.WEATHER_API_KEY;

const httpError = (message, statusCode) => Object.assign(new Error(message), { statusCode });

const toPlace = (p) => ({
  name: p.name,
  state: p.state || null,
  country: p.country,
  formatted_address: [p.name, p.state, p.country].filter(Boolean).join(', '),
  latitude: Number(p.lat.toFixed(6)),
  longitude: Number(p.lon.toFixed(6)),
});

async function call(path, params) {
  try {
    const resp = await axios.get(`${BASE_URL}${path}`, {
      params: { ...params, appid: process.env.WEATHER_API_KEY },
      timeout: 8000,
    });
    return Array.isArray(resp.data) ? resp.data : [];
  } catch (err) {
    logger.error('OpenWeather geocoding failed', { path, status: err.response?.status, error: err.message });
    throw httpError('Geocoding provider is temporarily unavailable. Please retry shortly.', 503);
  }
}

/** Address / place name → up to 5 matches, best first. */
async function forward(address) {
  const places = (await call('/direct', { q: address, limit: 5 }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  if (!places.length) throw httpError(`No location found for "${address}"`, 404);
  const results = places.map(toPlace);
  return { result: results[0], results };
}

/** Coordinates → the nearest named place. */
async function reverse(lat, lon) {
  const places = (await call('/reverse', { lat, lon, limit: 1 }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  if (!places.length) throw httpError(`No named place found near ${lat}, ${lon}`, 404);
  return { result: places.map(toPlace)[0] };
}

module.exports = { isConfigured, forward, reverse };