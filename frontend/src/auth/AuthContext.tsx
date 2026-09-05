import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { authApi } from '../api/auth';
import { TOKEN_STORAGE } from '../api/client';
import type { CapabilityName, User } from '../types';

interface AuthContextType {
  user: User | null;
  capabilities: CapabilityName[];
  role_label: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasCapability: (name: CapabilityName) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Initialize session from sessionStorage on app mount
  useEffect(() => {
    const initAuth = async () => {
      const accessToken = TOKEN_STORAGE.getAccessToken();
      if (!accessToken) {
        setIsLoading(false);
        return;
      }

      try {
        const userData = await authApi.getMe();
        setUser(userData);
      } catch (err) {
        console.error('Failed to restore session from access token:', err);
        TOKEN_STORAGE.clearTokens();
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();

    // Listen for global unauthorized events triggered by API client
    const handleUnauthorized = () => {
      setUser(null);
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => {
      window.removeEventListener('auth:unauthorized', handleUnauthorized);
    };
  }, []);

  const login = async (username: string, password: string) => {
    setIsLoading(true);
    try {
      const tokens = await authApi.login({ username, password });
      TOKEN_STORAGE.setTokens(tokens.access, tokens.refresh);
      const userData = await authApi.getMe();
      setUser(userData);
    } catch (err) {
      TOKEN_STORAGE.clearTokens();
      setUser(null);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    const refreshToken = TOKEN_STORAGE.getRefreshToken();
    if (refreshToken) {
      try {
        await authApi.logout(refreshToken);
      } catch (err) {
        console.warn('Backend logout call failed or token already blacklisted:', err);
      }
    }
    TOKEN_STORAGE.clearTokens();
    setUser(null);
  };

  const hasCapability = useCallback(
    (name: CapabilityName): boolean => {
      if (!user || !user.capabilities) {
        return false;
      }
      return user.capabilities.some((c: any) =>
        typeof c === 'object' && c?.name ? c.name === name : c === name
      );
    },
    [user]
  );

  const capabilities = user?.capabilities || [];
  const role_label = user?.role_label || null;
  const isAuthenticated = !!user;

  return (
    <AuthContext.Provider
      value={{
        user,
        capabilities,
        role_label,
        isAuthenticated,
        isLoading,
        login,
        logout,
        hasCapability,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
