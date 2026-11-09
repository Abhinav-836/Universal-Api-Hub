// backend/src/services/auth.service.js
const jwt = require('jsonwebtoken');
const UserModel = require('../models/user.model');
const { hashPassword, verifyPassword } = require('../utils/hash');
const logger = require('../utils/logger');
const { JWT_SECRET, JWT_EXPIRES_IN } = require('../config/jwt');
const { normalizeEmail } = require('validator');
const GoogleService = require('./google.service');

const httpError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const GOOGLE_ONLY =
  'This account signs in with Google. Use "Continue with Google".';

const signToken = (user) =>
  jwt.sign({ userId: user.id, email: user.email, plan: user.plan }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

/** A username from the email: letters and digits only, 3–30 chars, made unique. */
async function pickUsername(email) {
  let base = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24);
  if (base.length < 3) base = `${base}user`.slice(0, 24);
  if (!(await UserModel.usernameTaken(base))) return base;
  for (let i = 0; i < 8; i += 1) {
    const candidate = `${base}${Math.floor(1000 + Math.random() * 9000)}`;
    if (!(await UserModel.usernameTaken(candidate))) return candidate;
  }
  throw httpError('Could not create a username. Please sign up with email instead.', 500);
}

const AuthService = {
  register: async ({ email, username, password }) => {
    const exists = await UserModel.existsByEmailOrUsername(email, username);
    if (exists) {
      const error = new Error('Email or username already taken');
      error.statusCode = 409;
      throw error;
    }

    const passwordHash = await hashPassword(password);
    const user = await UserModel.create({ email, username, passwordHash });
    logger.info('New user registered', { userId: user.id, email: user.email });

    return user;
  },

  login: async ({ email, password }) => {
    const user = await UserModel.findByEmail(email);
    if (!user) {
      const error = new Error('Invalid credentials');
      error.statusCode = 401;
      throw error;
    }

    if (user.password_hash === UserModel.NO_PASSWORD) {
      throw httpError(GOOGLE_ONLY, 401);
    }

    const valid = await verifyPassword(user.password_hash, password);
    if (!valid) {
      logger.warn('Failed login attempt', { email });
      const error = new Error('Invalid credentials');
      error.statusCode = 401;
      throw error;
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, plan: user.plan },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    logger.info('User logged in', { userId: user.id });

    return {
      token,
      user: {
        id:       user.id,
        email:    user.email,
        username: user.username,
        plan:     user.plan,
      },
    };
  },

  /**
   * Sign in (or sign up) with the ID token from Google's button.
   * Found by Google's ID first, then by email (and linked); otherwise a new
   * account is made with no password.
   */
  googleLogin: async ({ credential }) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) throw httpError("Google sign-in isn't set up on this server.", 404);
    const claims = await GoogleService.verifyIdToken(credential, clientId);
    // Same normalisation as register/login (express-validator's normalizeEmail,
    // which e.g. drops dots in Gmail addresses), so the Google address matches
    // the account someone already made with it instead of creating a second one.
    const email = normalizeEmail(String(claims.email).trim()) || String(claims.email).toLowerCase().trim();
    const googleSub = String(claims.sub);

    let created = false;
    let user = await UserModel.findForGoogle({ googleSub, email });
    if (user) {
      if (user.google_sub && user.google_sub !== googleSub) {
        throw httpError('This email is already linked to a different Google account.', 409);
      }
      if (!user.is_active) throw httpError('User account is inactive', 403);
      if (!user.google_sub) {
        await UserModel.linkGoogle(user.id, googleSub);
        logger.info('Account linked to Google', { userId: user.id });
      }
    } else {
      const username = await pickUsername(email);
      user = await UserModel.createGoogle({ email, username, googleSub });
      created = true;
      logger.info('New user registered with Google', { userId: user.id });
    }

    return {
      created,
      token: signToken(user),
      user: { id: user.id, email: user.email, username: user.username, plan: user.plan },
    };
  },

  verifyToken: (token) => {
    try {
      return jwt.verify(token, JWT_SECRET);
    } catch (err) {
      const error = new Error('Invalid or expired token');
      error.statusCode = 401;
      throw error;
    }
  },

  refreshToken: async (userId) => {
    const user = await UserModel.findById(userId);
    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    if (!user.is_active) {
      const error = new Error('User account is inactive');
      error.statusCode = 403;
      throw error;
    }

    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        plan: user.plan
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    logger.info('Token refreshed', { userId: user.id, plan: user.plan });

    return { token };
  },

  changePassword: async ({ userId, currentPassword, newPassword }) => {
    const user = await UserModel.findByIdWithPassword(userId);
    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    // Accounts made with Google have no password yet: they can set a first one.
    const firstPassword = user.password_hash === UserModel.NO_PASSWORD;
    const valid = firstPassword || (currentPassword && (await verifyPassword(user.password_hash, currentPassword)));
    if (!valid) {
      const error = new Error('Current password is incorrect');
      error.statusCode = 401;
      throw error;
    }

    const newHash = await hashPassword(newPassword);
    await UserModel.updatePassword(userId, newHash);

    logger.info('Password changed', { userId });
  },
};

module.exports = AuthService;