import { create } from 'zustand';
import { createClient } from '@/utils/supabase/client';
import type { User as SupabaseUser, Session } from '@supabase/supabase-js';
import type { User, AuthStep } from '@/types/auth';

interface AuthState {
    user: User | null;
    supabaseUser: SupabaseUser | null;
    session: Session | null;
    authStep: AuthStep;
    email: string;
    isLoading: boolean;
    isAuthModalOpen: boolean;

    // Actions
    setAuthStep: (step: AuthStep) => void;
    setEmail: (email: string) => void;
    setUser: (user: User | null) => void;
    setSupabaseUser: (user: SupabaseUser | null) => void;
    setSession: (session: Session | null) => void;
    setIsLoading: (loading: boolean) => void;
    openAuthModal: (step?: AuthStep) => void;
    closeAuthModal: () => void;

    // Async Actions
    login: (email: string, password: string) => Promise<void>;
    register: (data: { email: string; password: string; firstName: string; lastName: string }) => Promise<void>;
    logout: () => Promise<void>;
    socialLogin: (provider: 'google' | 'apple' | 'facebook') => Promise<void>;
    resetPassword: (email: string) => Promise<void>;
    resendConfirmation: (email: string) => Promise<void>;

    // Helper to sync state from session
    syncSession: (session: Session | null) => void;
}

// Helper to extract user profile
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

const supabase = createClient();

export const useAuthStore = create<AuthState>((set, get) => ({
    user: null,
    supabaseUser: null,
    session: null,
    authStep: 'email',
    email: '',
    isLoading: true,
    isAuthModalOpen: false,

    setAuthStep: (authStep) => set({ authStep }),
    setEmail: (email) => set({ email }),
    setUser: (user) => set({ user }),
    setSupabaseUser: (supabaseUser) => set({ supabaseUser }),
    setSession: (session) => set({ session }),
    setIsLoading: (isLoading) => set({ isLoading }),
    openAuthModal: (step = 'email') => set({ isAuthModalOpen: true, authStep: step }),
    closeAuthModal: () => set({ isAuthModalOpen: false }),

    syncSession: (session) => {
        if (session?.user) {
            set({
                session,
                supabaseUser: session.user,
                user: extractUserProfile(session.user),
                isLoading: false,
            });
        } else {
            set({
                session: null,
                supabaseUser: null,
                user: null,
                isLoading: false,
            });
        }
    },

    login: async (email, password) => {
        set({ isLoading: true, email });
        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) throw error;

            if (data.user && data.session) {
                get().syncSession(data.session);
            }
        } catch (error: any) {
            console.error('Login failed:', error);
            if (error.message && (error.message.includes('Email not confirmed') || error.message.includes('email not confirmed'))) {
                set({ authStep: 'verify-email' });
            }
            throw error;
        } finally {
            set({ isLoading: false });
        }
    },

    register: async (data) => {
        set({ isLoading: true, email: data.email });
        try {
            const { data: authData, error } = await supabase.auth.signUp({
                email: data.email,
                password: data.password,
                options: {
                    emailRedirectTo: `${window.location.origin}/auth/callback`,
                    data: {
                        first_name: data.firstName,
                        last_name: data.lastName,
                        full_name: `${data.firstName} ${data.lastName}`,
                    },
                },
            });

            if (error) throw error;

            if (authData.user) {
                if (authData.session) {
                    get().syncSession(authData.session);
                } else {
                    // Email confirmation required
                    set({ authStep: 'verify-email' });
                }
            }
        } catch (error) {
            console.error('Registration failed:', error);
            throw error;
        } finally {
            set({ isLoading: false });
        }
    },

    logout: async () => {
        set({ isLoading: true });
        try {
            const { error } = await supabase.auth.signOut();
            if (error) throw error;
            get().syncSession(null);
        } catch (error) {
            console.error('Logout failed:', error);
            throw error;
        } finally {
            set({ isLoading: false });
        }
    },

    socialLogin: async (provider) => {
        set({ isLoading: true });
        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider,
                options: {
                    redirectTo: `${window.location.origin}/auth/callback`,
                },
            });
            if (error) throw error;
        } catch (error) {
            console.error(`${provider} login failed:`, error);
            set({ isLoading: false });
            throw error;
        }
    },

    resetPassword: async (email) => {
        set({ isLoading: true });
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/auth/reset-password`,
            });
            if (error) throw error;
            alert('Password reset email sent. Please check your inbox.');
        } catch (error) {
            console.error('Password reset failed:', error);
            throw error;
        } finally {
            set({ isLoading: false });
        }
    },

    resendConfirmation: async (email) => {
        set({ isLoading: true });
        try {
            const { error } = await supabase.auth.resend({
                type: 'signup',
                email: email,
            });
            if (error) throw error;
        } catch (error) {
            console.error('Resend confirmation failed:', error);
            throw error;
        } finally {
            set({ isLoading: false });
        }
    },
}));

// Selectors
export const useUser = () => useAuthStore((state) => state.user);
export const useSession = () => useAuthStore((state) => state.session);
export const useAuthStep = () => useAuthStore((state) => state.authStep);
export const useAuthLoading = () => useAuthStore((state) => state.isLoading);
