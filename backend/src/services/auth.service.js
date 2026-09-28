// backend/src/services/auth.service.js
const jwt = require('jsonwebtoken');
const UserModel = require('../models/user.model');
const { hashPassword, verifyPassword } = require('../utils/hash');
const logger = require('../utils/logger');
const { JWT_SECRET, JWT_EXPIRES_IN } = require('../config/jwt');

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

    const valid = await verifyPassword(user.password_hash, currentPassword);
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