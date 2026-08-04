/**
 * Auth Store — Client-Side Auth Operations
 *
 * Migrated from Supabase Auth to custom API routes (/api/auth/*).
 * No @supabase dependency. Uses fetch() to hit our own auth endpoints
 * which are backed by Lucia sessions stored in PostgreSQL.
 *
 * OAuth (Google/Apple/Facebook) social login is removed pending
 * OAuth provider configuration for the new auth system.
 */
import { create } from "zustand";
import type { User, AuthStep } from "@/types/auth";
import {
    loginSchema,
    registerSchema,
    emailSchema,
    profileSchema,
    updatePasswordSchema,
    type RegisterInput,
    type ProfileInput,
} from "@/lib/schemas/auth";
import { RETURN_TO_PARAM, safeReturnTo } from "@/lib/auth/returnTo";

// ─── Helpers ────────────────────────────────────────────────────────────────

async function apiFetch(path: string, body: unknown, method = 'POST') {
    const res = await fetch(path, {
        method,
        headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'cheapestgo-client' },
        body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
    return json;
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface AuthState {
    user: User | null;
    authStep: AuthStep;
    email: string;
    redirectTo: string | null;
    isLoading: boolean;
    isAuthModalOpen: boolean;

    setAuthStep: (step: AuthStep) => void;
    setEmail: (email: string) => void;
    openAuthModal: (step?: AuthStep, redirectTo?: string) => void;
    closeAuthModal: () => void;
    setUser: (user: User | null) => void;

    login: (email: string, password: string) => Promise<void>;
    register: (data: RegisterInput) => Promise<void>;
    logout: () => Promise<void>;
    /** `returnTo` overrides where the OAuth round trip lands; defaults to the current page. */
    socialLogin: (provider: "google" | "apple" | "facebook", returnTo?: string) => Promise<void>;
    resetPassword: (email: string) => Promise<void>;
    resendConfirmation: (email: string) => Promise<void>;
    updateProfile: (data: ProfileInput) => Promise<void>;
    updatePassword: (currentPassword: string, newPassword: string) => Promise<void>;
    syncProfile: (profile: Partial<User>) => void;
    fetchAndSyncRole: () => Promise<void>;
    initSession: () => Promise<void>;
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const useAuthStore = create<AuthState>((set, get) => {
    const withLoading = <T>(fn: () => Promise<T>): Promise<T> => {
        set({ isLoading: true });
        return fn().finally(() => set({ isLoading: false }));
    };

    return {
        user: null,
        authStep: "email",
        email: "",
        redirectTo: null,
        isLoading: true,
        isAuthModalOpen: false,

        setAuthStep: (authStep) => set({ authStep }),
        setEmail: (email) => set({ email }),
        openAuthModal: (step = 'email', redirectTo?: string) =>
            set({ isAuthModalOpen: true, authStep: step, redirectTo: redirectTo ?? get().redirectTo }),
        closeAuthModal: () => set({ isAuthModalOpen: false, redirectTo: null }),
        setUser: (user) => set({ user, isLoading: false }),

        /** Fetch the current session from the server on app boot. */
        initSession: async () => {
            try {
                const res = await fetch('/api/auth/me', {
                    headers: { 'X-Requested-By': 'cheapestgo-client' },
                });
                if (res.ok) {
                    const { user } = await res.json();
                    set({ user: user ?? null, isLoading: false });
                } else {
                    set({ user: null, isLoading: false });
                }
            } catch {
                set({ user: null, isLoading: false });
            }
        },

        login: async (email, password) => {
            loginSchema.parse({ email, password });
            set({ email });
            return withLoading(async () => {
                const { user } = await apiFetch('/api/auth/login', { email, password });
                set({
                    user: {
                        id: user.id,
                        email: user.email,
                        firstName: user.firstName ?? '',
                        lastName: user.lastName ?? '',
                        avatar: user.avatarUrl,
                        role: user.role ?? 'user',
                    },
                });
            });
        },

        register: async (data) => {
            registerSchema.parse(data);
            set({ email: data.email });
            return withLoading(async () => {
                const { user } = await apiFetch('/api/auth/signup', {
                    email: data.email,
                    password: data.password,
                    firstName: data.firstName,
                    lastName: data.lastName,
                    birthDate: data.birthDate,
                });
                set({
                    user: {
                        id: user.id,
                        email: user.email,
                        firstName: data.firstName ?? '',
                        lastName: data.lastName ?? '',
                        role: 'user',
                    },
                    authStep: 'email',
                });
            });
        },

        logout: () =>
            withLoading(async () => {
                await apiFetch('/api/auth/logout', {});
                set({ user: null });
            }),

        socialLogin: async (provider, returnTo) => {
            // Redirect to server-side OAuth initiation route.
            // Currently only Google is supported.
            if (provider === 'google') {
                // Where to land after Google sends the user back. Explicit arg wins,
                // then a `next` already on the URL (we're on /login?next=…), then a
                // path stashed by openAuthModal (in-page gate, e.g. flight booking),
                // and finally wherever the user currently is.
                let target = returnTo ?? null;
                if (!target && typeof window !== 'undefined') {
                    const urlNext = new URLSearchParams(window.location.search).get(RETURN_TO_PARAM);
                    target = urlNext ?? get().redirectTo ?? window.location.pathname + window.location.search;
                }
                const safe = safeReturnTo(target);
                const qs = safe === '/' ? '' : `?${RETURN_TO_PARAM}=${encodeURIComponent(safe)}`;
                window.location.href = `/api/auth/oauth/google${qs}`;
                return;
            }
            throw new Error(`OAuth provider "${provider}" is not configured yet.`);
        },

        resetPassword: (email) => {
            emailSchema.parse({ email });
            return withLoading(async () => {
                await apiFetch('/api/auth/reset-password', { email });
            });
        },

        resendConfirmation: (email) => {
            emailSchema.parse({ email });
            return withLoading(async () => {
                // Email verification is not required in the current implementation.
                // This is a no-op that can be wired to a verification email service.
                console.warn('[authStore] resendConfirmation: not implemented in custom auth');
            });
        },

        updateProfile: (data) => {
            profileSchema.parse(data);
            return withLoading(async () => {
                const res = await apiFetch('/api/account/profile', {
                    firstName: data.firstName,
                    lastName: data.lastName,
                }, 'PATCH');
                const { user } = get();
                if (user) {
                    set({
                        user: {
                            ...user,
                            firstName: res?.user?.firstName ?? data.firstName ?? user.firstName,
                            lastName: res?.user?.lastName ?? data.lastName ?? user.lastName,
                        },
                    });
                }
            });
        },

        updatePassword: (currentPassword, newPassword) => {
            updatePasswordSchema.parse({ currentPassword, newPassword });
            return withLoading(async () => {
                await apiFetch('/api/account/password', { currentPassword, newPassword }, 'PATCH');
            });
        },

        syncProfile: (profile) => {
            const { user } = get();
            if (user) set({ user: { ...user, ...profile } });
        },

        fetchAndSyncRole: async () => {
            try {
                const res = await fetch('/api/auth/me', {
                    headers: { 'X-Requested-By': 'cheapestgo-client' },
                });
                if (res.ok) {
                    const { user } = await res.json();
                    if (user?.role) {
                        set({ user: { ...get().user!, role: user.role } });
                    }
                }
            } catch (err) {
                console.error('[authStore] Failed to sync role:', err);
            }
        },
    };
});

// Selectors
export const useUser = () => useAuthStore((s) => s.user);
export const useAuthStep = () => useAuthStore((s) => s.authStep);
export const useAuthLoading = () => useAuthStore((s) => s.isLoading);
