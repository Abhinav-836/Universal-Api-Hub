// frontend/src/context/AuthContext.jsx
import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { authService } from '../services/auth';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authAttempts, setAuthAttempts] = useState(0);
  const [authError, setAuthError] = useState(null);
  const initCalled = useRef(false);
  const initTimeout = useRef(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;

    const init = async () => {
      if (initCalled.current) {
        console.log('⏭️ Auth init already in progress, skipping...');
        return;
      }

      initCalled.current = true;
      console.log('🔐 Checking authentication status...');

      try {
        const token = localStorage.getItem('auth_token');

        if (!token) {
          console.log('ℹ️ No token found, user is not authenticated');
          if (isMounted.current) {
            setUser(null);
            setLoading(false);
            setAuthError(null);
          }
          initCalled.current = false;
          return;
        }

        const data = await authService.me();

        if (isMounted.current && data?.success && data?.user) {
          console.log('✅ Authentication successful:', data.user.email);
          setUser(data.user);
          setAuthAttempts(0);
          setAuthError(null);
        } else if (isMounted.current) {
          console.warn('⚠️ Token invalid, clearing...');
          localStorage.removeItem('auth_token');
          setUser(null);
          setAuthError('Session expired. Please login again.');
        }
      } catch (err) {
        console.error('❌ Auth check failed:', err.message);

        if (err.response?.status === 429) {
          console.log('⏳ Rate limited, will retry...');
          setAuthError('Too many requests. Please try again later.');
        } else if (err.response?.status === 401) {
          console.log('🔑 Token expired or invalid');
          localStorage.removeItem('auth_token');
          setUser(null);
          setAuthError(null);
        } else if (err.code === 'ERR_NETWORK') {
          console.warn('🌐 Network error - backend may be down');
          setAuthError('Network error. Please check your connection.');
        } else {
          setAuthError(err.message || 'Authentication error');
        }

        if (isMounted.current) {
          setUser(null);
        }
      } finally {
        if (isMounted.current) {
          setLoading(false);
          initCalled.current = false;
          console.log('🏁 Auth initialization complete');
        }
      }
    };

    const timeoutId = setTimeout(init, 300);

    return () => {
      isMounted.current = false;
      clearTimeout(timeoutId);
      clearTimeout(initTimeout.current);
      initCalled.current = false;
    };
  }, []);

  const forceRefresh = useCallback(async () => {
    console.log('🔄 Force refreshing user data...');

    const token = localStorage.getItem('auth_token');
    if (!token) {
      console.log('ℹ️ No token found, cannot refresh');
      return null;
    }

    try {
      const data = await authService.me();
      if (isMounted.current && data?.success && data?.user) {
        setUser(data.user);
        console.log('✅ User data refreshed:', data.user);
        return data.user;
      }
      return null;
    } catch (err) {
      console.error('❌ Force refresh failed:', err);
      if (err.response?.status === 401) {
        localStorage.removeItem('auth_token');
        if (isMounted.current) {
          setUser(null);
        }
      }
      return null;
    }
  }, []);

  const login = useCallback(async (credentials) => {
    setLoading(true);
    setAuthError(null);

    try {
      console.log('🔑 Attempting login for:', credentials.email);
      const data = await authService.login(credentials);

      if (data?.success && data?.user) {
        console.log('✅ Login successful:', data.user.email);
        setUser(data.user);
        setAuthAttempts(0);
        setAuthError(null);
        return data;
      } else {
        throw new Error(data?.error || 'Login failed');
      }
    } catch (err) {
      console.error('❌ Login error:', err.message);

      // BUG FIX: This catch block previously threw a plain new Error(...),
      // which discarded the original axios error (and therefore its
      // `response.data.error`). Login.jsx then read `err.response?.data?.error`
      // and always saw undefined, so it fell back to a generic message — and
      // because the AuthContext ALSO held its own authError state, the two
      // error channels could desync and the red banner would never render.
      // Now we always compute a friendly message, keep the axios `response`
      // attached, and re-throw so the caller has full context.

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
          err.response?.data?.error || err.message || 'Login failed';
      }

      setAuthError(friendlyMessage);

      const enhanced = new Error(friendlyMessage);
      enhanced.response = err.response;
      enhanced.code = err.code;
      enhanced.status = err.response?.status;
      throw enhanced;
    } finally {
      setLoading(false);
    }
  }, []);

  const register = useCallback(async (data) => {
    setLoading(true);
    setAuthError(null);

    try {
      console.log('📝 Registering user:', data.email);
      const result = await authService.register(data);

      if (result?.success && result?.user) {
        console.log('✅ Registration successful:', result.user.email);
        setUser(result.user);
        setAuthError(null);
        return result;
      } else {
        throw new Error(result?.error || 'Registration failed');
      }
    } catch (err) {
      console.error('❌ Registration error:', err.message);

      // Same treatment as login: keep the axios response attached.
      const friendlyMessage =
        err.response?.data?.error ||
        err.response?.data?.errors?.[0]?.msg ||
        err.message ||
        'Registration failed';

      setAuthError(friendlyMessage);

      const enhanced = new Error(friendlyMessage);
      enhanced.response = err.response;
      enhanced.status = err.response?.status;
      throw enhanced;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setLoading(true);
    try {
      console.log('🚪 Logging out...');
      await authService.logout();
      setUser(null);
      setAuthAttempts(0);
      setAuthError(null);
      localStorage.removeItem('auth_token');
      console.log('✅ Logout successful');
    } catch (err) {
      console.warn('⚠️ Logout error:', err.message);
      setUser(null);
      setAuthAttempts(0);
      localStorage.removeItem('auth_token');
    } finally {
      setLoading(false);
    }
  }, []);

  const updateUser = useCallback((updates) => {
    setUser((prev) => {
      if (!prev) return null;
      const updated = { ...prev, ...updates };
      console.log('🔄 User updated:', updated);
      return updated;
    });
  }, []);

  // Auto-clear the context-level error banner after 5s
  useEffect(() => {
    if (authError) {
      const timer = setTimeout(() => {
        if (isMounted.current) {
          setAuthError(null);
        }
      }, 5000);
      return () => clearTimeout(timer);
    }
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

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
};