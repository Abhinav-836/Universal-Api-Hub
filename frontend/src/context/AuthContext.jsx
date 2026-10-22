// frontend/src/context/AuthContext.jsx
import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { authService } from '../services/auth';

const AuthContext = createContext(null);

/*
 * FIX: login() and register() used to set the GLOBAL `loading` flag.
 * PublicRoute/PrivateRoute render <Loading/> while it's true, so the Login
 * and Signup pages UNMOUNTED mid-request. Any error they set afterwards
 * was set on a component that no longer existed, so signup errors
 * ("Email or username already taken", validation messages) never showed.
 *
 * `loading` now only covers the initial session check. Pages track their
 * own submit spinners (they already did).
 *
 * register() also no longer sets `user`: the backend returns no token on
 * register, so a "logged-in" user without a token briefly existed and
 * triggered redirects + 401s. Signup calls login() right after.
 */
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authAttempts, setAuthAttempts] = useState(0);
  const [authError, setAuthError] = useState(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    let cancelled = false;

    const init = async () => {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        if (!cancelled) setLoading(false);
        return;
      }

      try {
        const data = await authService.me();
        if (cancelled) return;
        if (data?.success && data?.user) {
          setUser(data.user);
        } else {
          localStorage.removeItem('auth_token');
          setUser(null);
          setAuthError('Session expired. Please login again.');
        }
      } catch (err) {
        if (cancelled) return;
        setUser(null);
        if (err.response?.status === 401) {
          localStorage.removeItem('auth_token');
        } else if (err.response?.status === 429) {
          setAuthError('Too many requests. Please try again later.');
        } else if (err.code === 'ERR_NETWORK') {
          setAuthError('Network error. Please check your connection.');
        } else {
          setAuthError(err.message || 'Authentication error');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    init();

    return () => {
      cancelled = true;
      isMounted.current = false;
    };
  }, []);

  const forceRefresh = useCallback(async () => {
    if (!localStorage.getItem('auth_token')) return null;
    try {
      const data = await authService.me();
      if (isMounted.current && data?.success && data?.user) {
        setUser(data.user);
        return data.user;
      }
      return null;
    } catch (err) {
      if (err.response?.status === 401) {
        localStorage.removeItem('auth_token');
        if (isMounted.current) setUser(null);
      }
      return null;
    }
  }, []);

  const login = useCallback(async (credentials) => {
    setAuthError(null);
    try {
      const data = await authService.login(credentials);
      if (data?.success && data?.user) {
        setUser(data.user);
        setAuthAttempts(0);
        return data;
      }
      throw new Error(data?.error || 'Login failed');
    } catch (err) {
      let friendlyMessage;
      if (err.response?.status === 429) {
        friendlyMessage = 'Too many login attempts. Please wait a moment.';
        setAuthAttempts((prev) => prev + 1);
      } else if (err.response?.status === 401) {
        friendlyMessage = 'Invalid email or password';
      } else if (err.code === 'ERR_NETWORK') {
        friendlyMessage = 'Network error. Please check your connection.';
      } else {
        friendlyMessage =
          err.response?.data?.error ||
          err.response?.data?.errors?.[0]?.msg ||
          err.message ||
          'Login failed';
      }

      const enhanced = new Error(friendlyMessage);
      enhanced.response = err.response;
      enhanced.code = err.code;
      enhanced.status = err.response?.status;
      throw enhanced;
    }
  }, []);

  const register = useCallback(async (data) => {
    setAuthError(null);
    try {
      const result = await authService.register(data);
      if (result?.success && result?.user) return result;
      throw new Error(result?.error || 'Registration failed');
    } catch (err) {
      const friendlyMessage =
        err.response?.data?.errors?.[0]?.msg ||
        err.response?.data?.error ||
        (err.code === 'ERR_NETWORK' ? 'Network error. Please check your connection.' : null) ||
        err.message ||
        'Registration failed';

      const enhanced = new Error(friendlyMessage);
      enhanced.response = err.response;
      enhanced.status = err.response?.status;
      throw enhanced;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } finally {
      localStorage.removeItem('auth_token');
      setUser(null);
      setAuthAttempts(0);
      setAuthError(null);
    }
  }, []);

  const updateUser = useCallback((updates) => {
    setUser((prev) => (prev ? { ...prev, ...updates } : null));
  }, []);

  // Auto-clear the context-level error banner after 5s
  useEffect(() => {
    if (!authError) return undefined;
    const timer = setTimeout(() => {
      if (isMounted.current) setAuthError(null);
    }, 5000);
    return () => clearTimeout(timer);
  }, [authError]);

  const value = {
    user,
    loading,
    login,
    register,
    logout,
    updateUser,
    forceRefresh,
    authAttempts,
    authError,
    isAuthenticated: !!user && !!localStorage.getItem('auth_token'),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};