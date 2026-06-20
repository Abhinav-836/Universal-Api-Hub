import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { authService } from '../services/auth';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authAttempts, setAuthAttempts] = useState(0);

  // Rehydrate session on mount via HttpOnly cookie
  useEffect(() => {
    let mounted = true;
    let retryCount = 0;
    const maxRetries = 3;
    const delay = 2000; // 2 seconds

    const init = async () => {
      try {
        const data = await authService.me();
        if (mounted) setUser(data?.user ?? null);
      } catch (err) {
        // If rate limited, retry after delay
        if (err.response?.status === 429 && retryCount < maxRetries) {
          retryCount++;
          console.log(`Rate limited, retry ${retryCount} in ${delay}ms...`);
          setTimeout(init, delay);
          return;
        }
        if (mounted) setUser(null);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    
    // Add a small delay before initial load to prevent rate limiting
    const timeoutId = setTimeout(init, 500);
    return () => {
      mounted = false;
      clearTimeout(timeoutId);
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