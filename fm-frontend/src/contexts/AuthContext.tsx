import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  isAuthenticated,
  getCurrentUser,
  getAccessToken,
  refreshAccessToken,
  handleAuthCallback,
  signOut as authSignOut,
  redirectToLogin,
} from '../services/auth';

interface User {
  username?: string;
  name?: string;
  sub?: string;
  email?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: () => Promise<void>;
  signOut: () => void;
  getAuthToken: () => string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [callbackHandled, setCallbackHandled] = useState(false);

  useEffect(() => {
    const initializeAuth = async () => {
      const currentPath = window.location.pathname;
      const isCallbackRoute = currentPath === '/auth/callback';
      const urlParams = new URLSearchParams(window.location.search);
      const hasCode = urlParams.has('code');
      const error = urlParams.get('error');
      const errorDescription = urlParams.get('error_description');

      if (isCallbackRoute && error && !callbackHandled) {
        const errorMessage = errorDescription 
          ? `${error}: ${decodeURIComponent(errorDescription)}`
          : error;
        sessionStorage.setItem('auth_error', errorMessage);
        setCallbackHandled(true);
        setIsLoading(false);
        return;
      }

      if (isCallbackRoute && hasCode && !callbackHandled) {
        setIsLoading(true);
        setCallbackHandled(true);
        sessionStorage.removeItem('auth_error');
        try {
          const tokens = await handleAuthCallback();
          if (tokens) {
            const currentUser = getCurrentUser();
            setUser(currentUser);
            setIsLoading(false);
          } else {
            setIsLoading(false);
            sessionStorage.setItem('auth_error', 'Failed to exchange authorization code for tokens');
            return;
          }
        } catch (error) {
          setIsLoading(false);
          const errorMessage = error instanceof Error ? error.message : 'Authentication failed';
          sessionStorage.setItem('auth_error', errorMessage);
          return;
        }
        return;
      }

      if (!isCallbackRoute || callbackHandled) {
        setIsLoading(true);
        if (isAuthenticated()) {
          const currentUser = getCurrentUser();
          setUser(currentUser);
          
          const token = getAccessToken();
          if (token) {
            try {
              const payload = JSON.parse(atob(token.split('.')[1]));
              const expirationTime = payload.exp * 1000;
              const currentTime = Date.now();
              const timeUntilExpiry = expirationTime - currentTime;
              
              if (timeUntilExpiry < 5 * 60 * 1000) {
                await refreshAccessToken();
              }
            } catch (error) {
              // Ignore token expiration check errors
            }
          }
        }
        setIsLoading(false);
      }
    };

    initializeAuth();
  }, [callbackHandled]);

  const signIn = async () => {
    await redirectToLogin();
  };

  const signOut = () => {
    setUser(null);
    authSignOut();
  };

  const getAuthToken = (): string | null => {
    return getAccessToken();
  };

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: isAuthenticated(),
    signIn,
    signOut,
    getAuthToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

