import type { User as SupabaseUser, Session } from '@supabase/supabase-js';

// Application User type (simplified from Supabase)
export interface User {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    avatar?: string;
}

// Auth step in the authentication flow
export type AuthStep = 'email' | 'password' | 'register' | 'forgot-password';

// Auth context state
export interface AuthState {
    user: User | null;
    supabaseUser: SupabaseUser | null;
    session: Session | null;
    isAuthModalOpen: boolean;
    authStep: AuthStep;
    email: string;
    isLoading: boolean;
}

// Auth context actions
export interface AuthActions {
    openAuthModal: () => void;
    closeAuthModal: () => void;
    setAuthStep: (step: AuthStep) => void;
    setEmail: (email: string) => void;
    login: (email: string, password: string) => Promise<void>;
    register: (data: RegisterData) => Promise<void>;
    logout: () => Promise<void>;
    socialLogin: (provider: SocialProvider) => Promise<void>;
    resetPassword: (email: string) => Promise<void>;
}

// Combined auth context type
export interface AuthContextType extends AuthState, AuthActions { }

// Registration data
export interface RegisterData {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
}

// Social login providers
export type SocialProvider = 'google' | 'apple' | 'facebook';

// Re-export Supabase types for convenience
export type { SupabaseUser, Session };
