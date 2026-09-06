import type { Role } from '@/lib/auth/roles';

// Application User type
export interface User {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
    avatar?: string;
    /** One vocabulary for roles across the app — see `lib/auth/roles`. */
    role?: Role;
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

// Legacy type aliases — kept for gradual migration of components that reference them.
// These now map to our own types rather than Supabase types.
export type SupabaseUser = {
    id: string;
    email?: string;
    user_metadata: Record<string, unknown>;
    app_metadata: Record<string, unknown>;
};

export type Session = {
    user: SupabaseUser;
    access_token: string;
    expires_at?: number;
};
