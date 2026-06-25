// frontend/src/contexts/AuthContext.jsx
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

  // ✅ Check authentication on mount
  useEffect(() => {
    isMounted.current = true;
    
    const init = async () => {
      // Prevent multiple simultaneous initialization attempts
      if (initCalled.current) {
        console.log('⏭️ Auth init already in progress, skipping...');
        return;
      }
      
      initCalled.current = true;
      console.log('🔐 Checking authentication status...');

      try {
        const token = localStorage.getItem('auth_token');
        
        // If no token exists, skip the API call
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

        // ✅ Token exists, try to get user data
        const data = await authService.me();
        
        if (isMounted.current && data?.success && data?.user) {
          console.log('✅ Authentication successful:', data.user.email);
          setUser(data.user);
          setAuthAttempts(0);
          setAuthError(null);
        } else if (isMounted.current) {
          // Token exists but is invalid
          console.warn('⚠️ Token invalid, clearing...');
          localStorage.removeItem('auth_token');
          setUser(null);
          setAuthError('Session expired. Please login again.');
        }
      } catch (err) {
        console.error('❌ Auth check failed:', err.message);
        
        // ✅ Handle rate limiting (429) with retry
        if (err.response?.status === 429) {
          console.log('⏳ Rate limited, will retry...');
          // Retry logic is handled in the service layer
          setAuthError('Too many requests. Please try again later.');
        } 
        // ✅ Handle 401 Unauthorized - token expired/invalid
        else if (err.response?.status === 401) {
          console.log('🔑 Token expired or invalid');
          localStorage.removeItem('auth_token');
          setUser(null);
          setAuthError(null); // Don't show error for expected 401
        } 
        // ✅ Handle network errors
        else if (err.code === 'ERR_NETWORK') {
          console.warn('🌐 Network error - backend may be down');
          setAuthError('Network error. Please check your connection.');
        }
        // ✅ Handle other errors
        else {
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

    // ✅ Small delay to avoid race conditions with other components
    const timeoutId = setTimeout(init, 300);
    
    return () => {
      isMounted.current = false;
      clearTimeout(timeoutId);
      clearTimeout(initTimeout.current);
      initCalled.current = false;
    };
  }, []); // Empty dependency array ensures this runs once on mount

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
      
      // ✅ Handle rate limiting
      if (err.response?.status === 429) {
        setAuthAttempts(prev => prev + 1);
        setAuthError('Too many login attempts. Please wait a moment.');
        throw new Error('Too many login attempts. Please wait a moment.');
      }
      
      // ✅ Handle invalid credentials
      if (err.response?.status === 401) {
        setAuthError('Invalid email or password');
        throw new Error('Invalid email or password');
      }
      
      // ✅ Handle network errors
      if (err.code === 'ERR_NETWORK') {
        setAuthError('Network error. Please check your connection.');
        throw new Error('Network error. Please check your connection.');
      }
      
      setAuthError(err.message || 'Login failed');
      throw err;
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
      setAuthError(err.message || 'Registration failed');
      throw err;
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
      // Still clear local state even if server logout fails
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

  // ✅ Clear auth errors after 5 seconds (optional)
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