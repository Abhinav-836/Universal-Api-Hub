// backend/src/services/auth.service.js
const jwt = require('jsonwebtoken');
const UserModel = require('../models/user.model');
const { hashPassword, verifyPassword } = require('../utils/hash');
const logger = require('../utils/logger');
const { JWT_SECRET, JWT_EXPIRES_IN } = require('../config/jwt');

const AuthService = {
  /**
   * Register a new user
   */
  register: async ({ email, username, password }) => {
    // Check for existing user
    const exists = await UserModel.existsByEmailOrUsername(email, username);
    if (exists) {
      const error = new Error('Email or username already taken');
      error.statusCode = 409;
      throw error;
    }

    // Hash password with Argon2 + pepper
    const passwordHash = await hashPassword(password);

    // Create user
    const user = await UserModel.create({ email, username, passwordHash });
    logger.info('New user registered', { userId: user.id, email: user.email });

    return user;
  },

  /**
   * Login a user
   */
  login: async ({ email, password }) => {
    // Find user (includes password_hash)
    const user = await UserModel.findByEmail(email);
    if (!user) {
      const error = new Error('Invalid credentials');
      error.statusCode = 401;
      throw error;
    }

    // Verify password
    const valid = await verifyPassword(user.password_hash, password);
    if (!valid) {
      logger.warn('Failed login attempt', { email });
      const error = new Error('Invalid credentials');
      error.statusCode = 401;
      throw error;
    }

    // Generate JWT
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
   * Verify a JWT token
   */
  verifyToken: (token) => {
    try {
      return jwt.verify(token, JWT_SECRET);
    } catch (err) {
      const error = new Error('Invalid or expired token');
      error.statusCode = 401;
      throw error;
    }
  },

  /**
   * Refresh token (issue a new one)
   */
  refreshToken: async (userId) => {
    const user = await UserModel.findById(userId);
    if (!user || !user.is_active) {
      const error = new Error('User not found or inactive');
      error.statusCode = 401;
      throw error;
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, plan: user.plan },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return { token };
  },
};

module.exports = AuthService;
