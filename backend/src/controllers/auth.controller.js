// backend/src/controllers/auth.controller.js
const { validationResult } = require('express-validator');
const AuthService = require('../services/auth.service');
const UserModel   = require('../models/user.model');
const logger = require('../utils/logger');

// ✅ Cookie options for cross-domain authentication
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',  // true on Render
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,  // 7 days
};

const AuthController = {
  register: async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    try {
      const { email, username, password } = req.body;
      const user = await AuthService.register({ email, username, password });
      res.status(201).json({ success: true, message: 'Account created successfully', user });
    } catch (err) {
      logger.error('Register error', { error: err.message });
      res.status(err.statusCode || 500).json({ success: false, error: err.message });
    }
  },

  login: async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    try {
      const { email, password } = req.body;
      const result = await AuthService.login({ email, password });
      
      // ✅ Set HttpOnly cookie with cross-domain options
      res.cookie('jwt', result.token, cookieOptions);
      
      // Log cookie being set (for debugging)
      logger.info('Login successful - Cookie set', { 
        userId: result.user.id,
        secure: cookieOptions.secure,
        sameSite: cookieOptions.sameSite,
      });
      
      res.json({ success: true, user: result.user });
    } catch (err) {
      logger.error('Login error', { error: err.message });
      res.status(err.statusCode || 500).json({ success: false, error: err.message });
    }
  },

  logout: async (req, res) => {
    res.clearCookie('jwt', { ...cookieOptions, maxAge: 0 });
    res.json({ success: true, message: 'Logged out successfully' });
  },

  me: async (req, res) => {
    try {
      const user = await UserModel.findById(req.user.id);
      if (!user) return res.status(404).json({ success: false, error: 'User not found' });
      res.json({ success: true, user });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  },

  refresh: async (req, res) => {
    try {
      const result = await AuthService.refreshToken(req.user.id);
      res.cookie('jwt', result.token, cookieOptions);
      res.json({ success: true });
    } catch (err) {
      res.status(err.statusCode || 500).json({ success: false, error: err.message });
    }
  },
};

module.exports = AuthController;