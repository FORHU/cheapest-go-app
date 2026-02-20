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
export type AuthStep = 'email' | 'password' | 'register' | 'forgot-password' | 'verify-email';

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
