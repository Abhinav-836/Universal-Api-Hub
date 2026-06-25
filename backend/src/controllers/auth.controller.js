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
      
      // ✅ Return user data (no token needed for registration)
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
      
      // ✅ FORCE secure and sameSite for production
      const isProduction = process.env.NODE_ENV === 'production';
      
      // Set HTTP-only cookie for cross-domain authentication
      res.cookie('jwt', result.token, {
        httpOnly: true,
        secure: true,  // ✅ ALWAYS true for HTTPS (Render/Vercel)
        sameSite: 'none',  // ✅ ALWAYS 'none' for cross-domain
        maxAge: 7 * 24 * 60 * 60 * 1000,  // 7 days
        path: '/',
      });
      
      logger.info('Login successful - Cookie set', { 
        userId: result.user.id,
        secure: true,
        sameSite: 'none',
        cookieSet: true,
      });
      
      // ✅ FIX: Return token in response body for localStorage
      // This allows frontend to store token and use it in Authorization header
      res.json({ 
        success: true, 
        user: result.user,
        token: result.token  // ← CRITICAL FIX: Return token for frontend storage
      });
    } catch (err) {
      logger.error('Login error', { error: err.message });
      res.status(err.statusCode || 500).json({ success: false, error: err.message });
    }
  },

  logout: async (req, res) => {
    // Clear the cookie
    res.clearCookie('jwt', {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/',
    });
    
    // ✅ Also clear any server-side session data if needed
    // (If you have session-based tracking beyond JWT)
    
    res.json({ 
      success: true, 
      message: 'Logged out successfully' 
    });
  },

  me: async (req, res) => {
    try {
      // req.user is set by jwtAuth middleware
      const user = await UserModel.findById(req.user.id);
      
      if (!user) {
        return res.status(404).json({ 
          success: false, 
          error: 'User not found' 
        });
      }
      
      // ✅ Return user data without sensitive fields
      const userData = {
        id: user.id,
        email: user.email,
        username: user.username,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
        // Don't return password, resetToken, etc.
      };
      
      res.json({ success: true, user: userData });
    } catch (err) {
      logger.error('Me endpoint error', { error: err.message, userId: req.user?.id });
      res.status(500).json({ success: false, error: err.message });
    }
  },

  refresh: async (req, res) => {
    try {
      // req.user is set by jwtAuth middleware
      const result = await AuthService.refreshToken(req.user.id);
      
      // ✅ Refresh the cookie with new token
      res.cookie('jwt', result.token, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/',
      });
      
      // ✅ Return new token for frontend localStorage update
      res.json({ 
        success: true,
        token: result.token  // ← Allow frontend to update localStorage
      });
    } catch (err) {
      logger.error('Refresh token error', { 
        error: err.message, 
        userId: req.user?.id 
      });
      res.status(err.statusCode || 500).json({ 
        success: false, 
        error: err.message 
      });
    }
  },

  // ✅ Optional: Add a health check endpoint
  health: async (req, res) => {
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development'
    });
  },

  // ✅ Optional: Add password change endpoint
  changePassword: async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      
      // Validate input
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ 
          success: false, 
          error: 'Current password and new password are required' 
        });
      }
      
      // Call service to change password
      await AuthService.changePassword({
        userId: req.user.id,
        currentPassword,
        newPassword
      });
      
      res.json({ 
        success: true, 
        message: 'Password changed successfully' 
      });
    } catch (err) {
      logger.error('Change password error', { 
        error: err.message, 
        userId: req.user?.id 
      });
      res.status(err.statusCode || 500).json({ 
        success: false, 
        error: err.message 
      });
    }
  }
};

module.exports = AuthController;