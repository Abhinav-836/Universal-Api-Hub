// backend/src/controllers/auth.controller.js
const { validationResult } = require('express-validator');
const AuthService = require('../services/auth.service');
const UserModel   = require('../models/user.model');
const logger = require('../utils/logger');

const AuthController = {
  register: async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    try {
      const { email, username, password } = req.body;
      const user = await AuthService.register({ email, username, password });
      res.status(201).json({
        success: true,
        message: 'Account created successfully',
        user
      });
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

      // FIX: only force secure/none in production, otherwise dev cookies get dropped by browser
      const isProduction = process.env.NODE_ENV === 'production';
      res.cookie('jwt', result.token, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'none' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/',
      });

      logger.info('Login successful - Cookie set', {
        userId: result.user.id,
        secure: isProduction,
        sameSite: isProduction ? 'none' : 'lax',
      });

      res.json({
        success: true,
        user: result.user,
        token: result.token
      });
    } catch (err) {
      logger.error('Login error', { error: err.message });
      res.status(err.statusCode || 500).json({ success: false, error: err.message });
    }
  },

  logout: async (req, res) => {
    const isProduction = process.env.NODE_ENV === 'production';
    res.clearCookie('jwt', {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      path: '/',
    });
    res.json({ success: true, message: 'Logged out successfully' });
  },

  me: async (req, res) => {
    try {
      const user = await UserModel.findById(req.user.id);
      if (!user) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }
      const userData = {
        id: user.id,
        email: user.email,
        username: user.username,
        plan: user.plan,
        createdAt: user.created_at,
      };
      res.json({ success: true, user: userData });
    } catch (err) {
      logger.error('Me endpoint error', { error: err.message, userId: req.user?.id });
      res.status(500).json({ success: false, error: err.message });
    }
  },

  refresh: async (req, res) => {
    try {
      const result = await AuthService.refreshToken(req.user.id);
      const isProduction = process.env.NODE_ENV === 'production';
      res.cookie('jwt', result.token, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'none' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/',
      });
      res.json({ success: true, token: result.token });
    } catch (err) {
      logger.error('Refresh token error', { error: err.message, userId: req.user?.id });
      res.status(err.statusCode || 500).json({ success: false, error: err.message });
    }
  },

  health: async (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development'
    });
  },

  changePassword: async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    try {
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          success: false,
          error: 'Current password and new password are required'
        });
      }
      await AuthService.changePassword({
        userId: req.user.id,
        currentPassword,
        newPassword
      });
      res.json({ success: true, message: 'Password changed successfully' });
    } catch (err) {
      logger.error('Change password error', { error: err.message, userId: req.user?.id });
      res.status(err.statusCode || 500).json({ success: false, error: err.message });
    }
  }
};

module.exports = AuthController;