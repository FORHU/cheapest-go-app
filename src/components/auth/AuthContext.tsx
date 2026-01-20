"use client";

import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { createClient } from '@/utils/supabase/client';
import type { User as SupabaseUser, Session } from '@supabase/supabase-js';

export type AuthStep = 'email' | 'password' | 'register' | 'forgot-password';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatar?: string;
}

interface AuthContextType {
  user: User | null;
  supabaseUser: SupabaseUser | null;
  session: Session | null;
  isAuthModalOpen: boolean;
  authStep: AuthStep;
  email: string;
  isLoading: boolean;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  setAuthStep: (step: AuthStep) => void;
  setEmail: (email: string) => void;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { email: string; password: string; firstName: string; lastName: string }) => Promise<void>;
  logout: () => Promise<void>;
  socialLogin: (provider: 'google' | 'apple' | 'facebook') => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

// Helper to extract user profile from Supabase user
const extractUserProfile = (supabaseUser: SupabaseUser): User => {
  const metadata = supabaseUser.user_metadata || {};
  return {
    id: supabaseUser.id,
    email: supabaseUser.email || '',
    firstName: metadata.first_name || metadata.firstName || metadata.name?.split(' ')[0] || 'User',
    lastName: metadata.last_name || metadata.lastName || metadata.name?.split(' ').slice(1).join(' ') || '',
    avatar: metadata.avatar_url || metadata.picture,
  };
};

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authStep, setAuthStep] = useState<AuthStep>('email');
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const supabase = createClient();

  // Initialize auth state and listen for changes
  useEffect(() => {
    // Get initial session
    const initializeAuth = async () => {
      try {
        const { data: { session: initialSession } } = await supabase.auth.getSession();

        if (initialSession?.user) {
          setSession(initialSession);
          setSupabaseUser(initialSession.user);
          setUser(extractUserProfile(initialSession.user));
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, currentSession) => {
        console.log('Auth state changed:', event);

        if (currentSession?.user) {
          setSession(currentSession);
          setSupabaseUser(currentSession.user);
          setUser(extractUserProfile(currentSession.user));
        } else {
          setSession(null);
          setSupabaseUser(null);
          setUser(null);
        }
        setIsLoading(false);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const openAuthModal = useCallback(() => {
    setIsAuthModalOpen(true);
    setAuthStep('email');
    setEmail('');
  }, []);

  const closeAuthModal = useCallback(() => {
    setIsAuthModalOpen(false);
    setAuthStep('email');
    setEmail('');
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw error;
      }

      if (data.user) {
        setUser(extractUserProfile(data.user));
        setSupabaseUser(data.user);
        setSession(data.session);
        closeAuthModal();
      }
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [closeAuthModal, supabase.auth]);

  const register = useCallback(async (data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string
  }) => {
    setIsLoading(true);
    try {
      const { data: authData, error } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            first_name: data.firstName,
            last_name: data.lastName,
            full_name: `${data.firstName} ${data.lastName}`,
          },
        },
      });

      if (error) {
        throw error;
      }

      if (authData.user) {
        // Note: User may need to confirm email depending on Supabase settings
        if (authData.session) {
          setUser(extractUserProfile(authData.user));
          setSupabaseUser(authData.user);
          setSession(authData.session);
          closeAuthModal();
        } else {
          // Email confirmation required
          closeAuthModal();
          alert('Please check your email to confirm your account.');
        }
      }
    } catch (error) {
      console.error('Registration failed:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [closeAuthModal, supabase.auth]);

  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      setUser(null);
      setSupabaseUser(null);
      setSession(null);
    } catch (error) {
      console.error('Logout failed:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [supabase.auth]);

  const socialLogin = useCallback(async (provider: 'google' | 'apple' | 'facebook') => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        throw error;
      }

      // The redirect will happen automatically
    } catch (error) {
      console.error(`${provider} login failed:`, error);
      setIsLoading(false);
      throw error;
    }
  }, [supabase.auth]);

  const resetPassword = useCallback(async (email: string) => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });

      if (error) {
        throw error;
      }

      alert('Password reset email sent. Please check your inbox.');
    } catch (error) {
      console.error('Password reset failed:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [supabase.auth]);

  return (
    <AuthContext.Provider
      value={{
        user,
        supabaseUser,
        session,
        isAuthModalOpen,
        authStep,
        email,
        isLoading,
        openAuthModal,
        closeAuthModal,
        setAuthStep,
        setEmail,
        login,
        register,
        logout,
        socialLogin,
        resetPassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
