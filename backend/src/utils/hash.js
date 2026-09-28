// backend/src/utils/hash.js
const crypto = require('crypto');
const argon2 = require('argon2');

const PEPPER = process.env.PEPPER;
const API_KEY_SECRET = process.env.API_KEY_SECRET;

if (!PEPPER || !API_KEY_SECRET) {
  throw new Error('FATAL: PEPPER and API_KEY_SECRET env vars must be set. Refusing to start for security reasons.');
}

const hashPassword = async (password) => {
  const pepperedPassword = `${PEPPER}:${password}`;
  return argon2.hash(pepperedPassword, {
    type:        argon2.argon2id,
    memoryCost:  65536,
    timeCost:    3,
    parallelism: 4,
  });
};

const verifyPassword = async (hash, password) => {
  const pepperedPassword = `${PEPPER}:${password}`;
  return argon2.verify(hash, pepperedPassword);
};

const generateApiKey = (userId) => {
  const timestamp  = Date.now().toString();
  const randomBytes = crypto.randomBytes(32).toString('hex');

  const layer1 = crypto
    .createHmac('sha256', API_KEY_SECRET)
    .update(`${userId}:${timestamp}:${randomBytes}`)
    .digest('hex');

  const additionalEntropy = crypto.randomBytes(16).toString('hex');
  const layer2 = crypto
    .createHmac('sha512', API_KEY_SECRET)
    .update(`${layer1}:${additionalEntropy}:${timestamp}`)
    .digest('hex');

  const rawKey = `uhb_${Buffer.from(layer2, 'hex').toString('base64url')}`;

  const keyHash = hashApiKey(rawKey);
  const keyPrefix = rawKey.substring(0, 12);

  return { rawKey, keyHash, keyPrefix };
};

const hashApiKey = (rawKey) => {
  return crypto
    .createHmac('sha256', API_KEY_SECRET)
    .update(rawKey)
    .digest('hex');
};

const generateSecureToken = (bytes = 32) => {
  return crypto.randomBytes(bytes).toString('hex');
};

const sha256 = (data) => {
  return crypto.createHash('sha256').update(data).digest('hex');
};

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