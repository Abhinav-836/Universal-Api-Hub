// Google sign-in: token checks and account handling.
// Google is never called: tests sign their own ID tokens with a throwaway RSA
// key, and axios returns its certificate as if it were Google's.
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const request = require('supertest');

jest.mock('../src/services/rateLimit.service', () => ({ checkIpLimit: jest.fn().mockResolvedValue(false) }));
jest.mock('axios');
jest.mock('../src/models/user.model');

const axios = require('axios');
const UserModel = require('../src/models/user.model');
const GoogleService = require('../src/services/google.service');
const app = require('../src/app');
const { getRedis } = require('../src/config/redis');

const CLIENT_ID = 'test-client.apps.googleusercontent.com';
const KID = 'kid-1';
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const PRIVATE_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' });
const PUBLIC_PEM = publicKey.export({ type: 'spki', format: 'pem' });

const idToken = ({
  email = 'priya.sharma@gmail.com', sub = 'g-123', aud = CLIENT_ID, iss = 'https://accounts.google.com',
  verified = true, expiresIn = 600, key = PRIVATE_PEM, alg = 'RS256',
} = {}) =>
  jwt.sign({ email, sub, email_verified: verified, name: 'Priya Sharma' }, key, {
    algorithm: alg, audience: aud, issuer: iss, expiresIn, keyid: KID,
  });

const google = (credential) => request(app).post('/auth/google').send({ credential });

beforeEach(() => {
  jest.resetAllMocks();
  process.env.GOOGLE_CLIENT_ID = CLIENT_ID;
  GoogleService._cache.certs = {};
  GoogleService._cache.expires = 0;
  axios.get.mockResolvedValue({ data: { [KID]: PUBLIC_PEM }, headers: { 'cache-control': 'public, max-age=3600' } });
  UserModel.NO_PASSWORD = '!google';
  UserModel.usernameTaken.mockResolvedValue(false);
});

afterAll(async () => {
  const redis = getRedis();
  if (redis && redis.status !== 'end') await redis.quit();
});

describe('GET /auth/config', () => {
  it('tells the frontend the Google client ID', async () => {
    const res = await request(app).get('/auth/config');
    expect(res.body.googleClientId).toBe(CLIENT_ID);
  });
});

describe('POST /auth/google', () => {
  it('creates an account for a new person, with no password and a username from the email', async () => {
    UserModel.findForGoogle.mockResolvedValue(null);
    UserModel.createGoogle.mockImplementation(async ({ email, username, googleSub }) => ({
      id: 'u1', email, username, plan: 'free', googleSub,
    }));

    const res = await google(idToken());
    expect(res.statusCode).toBe(201);
    expect(res.body.created).toBe(true);
    expect(res.body.user.username).toBe('priyasharma');
    // Stored the way register stores it (Gmail dots removed), so a later email login finds it.
    expect(UserModel.createGoogle).toHaveBeenCalledWith({ email: 'priyasharma@gmail.com', username: 'priyasharma', googleSub: 'g-123' });
    expect(jwt.verify(res.body.token, process.env.JWT_SECRET).userId).toBe('u1');
    expect(res.headers['set-cookie'][0]).toMatch(/^jwt=/);
  });

  it('adds digits when the username is taken', async () => {
    UserModel.findForGoogle.mockResolvedValue(null);
    UserModel.usernameTaken.mockImplementation(async (u) => u === 'priyasharma');
    UserModel.createGoogle.mockImplementation(async (a) => ({ id: 'u2', plan: 'free', ...a }));
    const res = await google(idToken());
    expect(res.body.user.username).toMatch(/^priyasharma\d{4}$/);
  });

  it('links an existing account found by email, and its old password stops working', async () => {
    UserModel.findForGoogle.mockResolvedValue({
      id: 'u3', email: 'priya.sharma@gmail.com', username: 'priya', plan: 'pro', password_hash: '$argon2id$x', google_sub: null, is_active: true,
    });
    const res = await google(idToken());
    expect(res.statusCode).toBe(200);
    expect(res.body.created).toBe(false);
    expect(res.body.user).toEqual({ id: 'u3', email: 'priya.sharma@gmail.com', username: 'priya', plan: 'pro' });
    expect(UserModel.linkGoogle).toHaveBeenCalledWith('u3', 'g-123');
    expect(UserModel.findForGoogle).toHaveBeenCalledWith({ googleSub: 'g-123', email: 'priyasharma@gmail.com' });
  });

  it('signs in an already-linked account without changing it', async () => {
    UserModel.findForGoogle.mockResolvedValue({
      id: 'u4', email: 'priya.sharma@gmail.com', username: 'priya', plan: 'free', password_hash: '!google', google_sub: 'g-123', is_active: true,
    });
    const res = await google(idToken());
    expect(res.statusCode).toBe(200);
    expect(UserModel.linkGoogle).not.toHaveBeenCalled();
  });

  it('refuses a different Google account for an already-linked email', async () => {
    UserModel.findForGoogle.mockResolvedValue({ id: 'u5', email: 'priya.sharma@gmail.com', google_sub: 'someone-else', is_active: true });
    expect((await google(idToken())).statusCode).toBe(409);
  });

  it('refuses a disabled account', async () => {
    UserModel.findForGoogle.mockResolvedValue({ id: 'u6', email: 'priya.sharma@gmail.com', google_sub: 'g-123', is_active: false });
    expect((await google(idToken())).statusCode).toBe(403);
  });

  it.each([
    ['made for another app', { aud: 'other-app.apps.googleusercontent.com' }],
    ['not issued by Google', { iss: 'https://evil.example.com' }],
    ['expired', { expiresIn: -60 }],
    ['forged signature', { key: crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }) }],
    ['HS256 with a guessable secret', { alg: 'HS256', key: 'secret' }],
  ])('refuses a token %s', async (_, opts) => {
    UserModel.findForGoogle.mockResolvedValue(null);
    const res = await google(idToken(opts));
    expect(res.statusCode).toBe(401);
    expect(UserModel.createGoogle).not.toHaveBeenCalled();
  });

  it('refuses an unverified Google email', async () => {
    const res = await google(idToken({ verified: false }));
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toMatch(/verified/);
  });

  it('refuses garbage', async () => {
    expect((await google('this-is-not-a-jwt-at-all')).statusCode).toBe(401);
  });

  it('is off without GOOGLE_CLIENT_ID', async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    expect((await google(idToken())).statusCode).toBe(404);
    expect((await request(app).get('/auth/config')).body.googleClientId).toBeNull();
  });
});

describe('POST /auth/login for a Google-only account', () => {
  it('says to use Google instead of "invalid credentials"', async () => {
    UserModel.findByEmail.mockResolvedValue({ id: 'u7', email: 'priya.sharma@gmail.com', password_hash: '!google', is_active: true });
    const res = await request(app).post('/auth/login').send({ email: 'priya.sharma@gmail.com', password: 'Whatever123' });
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toMatch(/Google/);
  });
});
