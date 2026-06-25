import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { authService } from '../services/auth';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authAttempts, setAuthAttempts] = useState(0);
  const initCalled = useRef(false);
  const initTimeout = useRef(null);

  useEffect(() => {
    let mounted = true;
    let retryCount = 0;
    const maxRetries = 3;
    const delay = 2000;

    const init = async () => {
      if (initCalled.current) return;
      initCalled.current = true;

      try {
        const data = await authService.me();
        if (mounted && data?.user) {
          setUser(data.user);
          setAuthAttempts(0);
        }
      } catch (err) {
        // Only retry on 429 rate limiting
        if (err.response?.status === 429 && retryCount < maxRetries) {
          retryCount++;
          console.log(`Rate limited, retry ${retryCount}/${maxRetries} in ${delay}ms...`);
          clearTimeout(initTimeout.current);
          initTimeout.current = setTimeout(() => {
            initCalled.current = false;
            init();
          }, delay);
          return;
        }
        // For 401 or other errors, set user to null
        if (mounted) {
          setUser(null);
          localStorage.removeItem('auth_token');
        }
      } finally {
        if (mounted) {
          setLoading(false);
          initCalled.current = false;
        }
      }
    };

    const timeoutId = setTimeout(init, 500);
    
    return () => {
      mounted = false;
      clearTimeout(timeoutId);
      clearTimeout(initTimeout.current);
      initCalled.current = false;
    };
  }, []);

  const login = useCallback(async (credentials) => {
    setLoading(true);
    try {
      const data = await authService.login(credentials);
      setUser(data.user);
      setAuthAttempts(0);
      return data;
    } catch (err) {
      if (err.response?.status === 429) {
        setAuthAttempts(prev => prev + 1);
        throw new Error('Too many login attempts. Please wait a moment.');
      }
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const register = useCallback(async (data) => {
    const result = await authService.register(data);
    return result;
  }, []);

  const logout = useCallback(() => {
    authService.logout();
    setUser(null);
    setAuthAttempts(0);
    localStorage.removeItem('auth_token');
  }, []);

  const updateUser = useCallback((updates) => {
    setUser((prev) => prev ? { ...prev, ...updates } : null);
  }, []);

  const value = {
    user,
    loading,
    login,
    register,
    logout,
    updateUser,
    authAttempts,
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