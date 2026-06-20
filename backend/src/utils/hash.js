// backend/src/utils/hash.js
// Multi-layer hashing system for API keys and passwords
const crypto = require('crypto');
const argon2 = require('argon2');

const PEPPER = process.env.PEPPER;
const API_KEY_SECRET = process.env.API_KEY_SECRET;

if (!PEPPER || !API_KEY_SECRET) {
  throw new Error('FATAL: PEPPER and API_KEY_SECRET env vars must be set. Refusing to start for security reasons.');
}

// ============================================================
// PASSWORD HASHING (Argon2id + PEPPER)
// ============================================================

/**
 * Hash a password using Argon2id with an added pepper
 * @param {string} password - Plain text password
 * @returns {Promise<string>} Argon2 hash
 */
const hashPassword = async (password) => {
  const pepperedPassword = `${PEPPER}:${password}`;
  return argon2.hash(pepperedPassword, {
    type:        argon2.argon2id,
    memoryCost:  65536,  // 64 MB
    timeCost:    3,
    parallelism: 4,
  });
};

/**
 * Verify a password against an Argon2 hash
 * @param {string} hash - Stored Argon2 hash
 * @param {string} password - Plain text password to verify
 * @returns {Promise<boolean>}
 */
const verifyPassword = async (hash, password) => {
  const pepperedPassword = `${PEPPER}:${password}`;
  return argon2.verify(hash, pepperedPassword);
};

// ============================================================
// API KEY GENERATION (Multi-layer SHA-256 / SHA-512)
// ============================================================

/**
 * Generate a cryptographically secure API key using multi-layer hashing.
 * Flow: randomBytes → SHA-256(userId + timestamp + random) → SHA-512(layer1 + secret) → base64url
 * @param {string} userId - The user's UUID
 * @returns {{ rawKey: string, keyHash: string, keyPrefix: string }}
 */
const generateApiKey = (userId) => {
  const timestamp  = Date.now().toString();
  const randomBytes = crypto.randomBytes(32).toString('hex');

  // Layer 1: SHA-256 of userId + timestamp + random
  const layer1 = crypto
    .createHmac('sha256', API_KEY_SECRET)
    .update(`${userId}:${timestamp}:${randomBytes}`)
    .digest('hex');

  // Layer 2: SHA-512 of layer1 + secret + additional entropy
  const additionalEntropy = crypto.randomBytes(16).toString('hex');
  const layer2 = crypto
    .createHmac('sha512', API_KEY_SECRET)
    .update(`${layer1}:${additionalEntropy}:${timestamp}`)
    .digest('hex');

  // Format the raw key: uhb_ prefix + base64url-encoded layer2
  const rawKey = `uhb_${Buffer.from(layer2, 'hex').toString('base64url')}`;

  // The stored hash: SHA-256 of the raw key (for fast lookups)
  const keyHash = hashApiKey(rawKey);

  // Prefix: first 12 chars for identification display
  const keyPrefix = rawKey.substring(0, 12);

  return { rawKey, keyHash, keyPrefix };
};

/**
 * Hash an API key for storage/lookup (SHA-256)
 * @param {string} rawKey - The raw API key
 * @returns {string} Hex-encoded SHA-256 hash
 */
const hashApiKey = (rawKey) => {
  return crypto
    .createHmac('sha256', API_KEY_SECRET)
    .update(rawKey)
    .digest('hex');
};

/**
 * Generate a secure random token (for JWT secrets, etc.)
 * @param {number} bytes - Number of random bytes
 * @returns {string} Hex-encoded random token
 */
const generateSecureToken = (bytes = 32) => {
  return crypto.randomBytes(bytes).toString('hex');
};

/**
 * SHA-256 hash of arbitrary data
 * @param {string} data
 * @returns {string} Hex hash
 */
const sha256 = (data) => {
  return crypto.createHash('sha256').update(data).digest('hex');
};

/**
 * SHA-512 hash of arbitrary data
 * @param {string} data
 * @returns {string} Hex hash
 */
const sha512 = (data) => {
  return crypto.createHash('sha512').update(data).digest('hex');
};

module.exports = {
  hashPassword,
  verifyPassword,
  generateApiKey,
  hashApiKey,
  generateSecureToken,
  sha256,
  sha512,
};
