/**
 * Auth Store — Client-Side Supabase Operations
 *
 * Uses the browser Supabase client for operations that MUST run client-side:
 * - Login/registration (sets browser cookies)
 * - OAuth redirects (requires browser navigation)
 * - Session management (real-time listener in AuthListener)
 *
 * All database queries use server actions instead. Do NOT add `.from()` calls here.
 */
import { create } from "zustand";
import { createClient } from "@/utils/supabase/client";
import type { User as SupabaseUser, Session } from "@supabase/supabase-js";
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

// --- Helpers ---

const getSupabase = () => createClient();

const extractUserProfile = (supabaseUser: SupabaseUser): User => {
    const meta = supabaseUser.user_metadata || {};
    return {
        id: supabaseUser.id,
        email: supabaseUser.email || "",
        firstName:
            meta.first_name || meta.firstName || meta.name?.split(" ")[0] || "User",
        lastName:
            meta.last_name ||
            meta.lastName ||
            meta.name?.split(" ").slice(1).join(" ") ||
            "",
        avatar: meta.avatar_url || meta.picture,
        role: meta.role || 'user',
    };
};

const buildRedirectUrl = (
    path = "/auth/callback",
    explicitRedirect?: string,
) => {
    const searchParams = new URLSearchParams(window.location.search);
    let targetPath =
        explicitRedirect ||
        searchParams.get("redirect") ||
        searchParams.get("next");

    // If no target provided, fallback to current page
    if (!targetPath) {
        targetPath = window.location.pathname + window.location.search;
    }

    // Handle absolute URLs from the same origin
    if (targetPath.startsWith(window.location.origin)) {
        targetPath = targetPath.substring(window.location.origin.length);
    }

    // Safety check: if we are already on login/auth pages, don't redirect back to them
    if (targetPath.includes("/login") || targetPath.includes("/auth/")) {
        targetPath = "/";
    }

    // Only include safe relative paths in the redirect (must start with /, but not //)
    const safePath =
        targetPath.startsWith("/") && !targetPath.startsWith("//")
            ? targetPath
            : "/";

    return `${window.location.origin}${path}?next=${encodeURIComponent(safePath)}`;
};

// --- Types ---

interface AuthState {
    user: User | null;
    supabaseUser: SupabaseUser | null;
    session: Session | null;
    authStep: AuthStep;
    email: string;
    redirectTo: string | null;
    isLoading: boolean;
    isAuthModalOpen: boolean;

    setAuthStep: (step: AuthStep) => void;
    setEmail: (email: string) => void;
    openAuthModal: (step?: AuthStep, redirectTo?: string) => void;
    closeAuthModal: () => void;
    syncSession: (session: Session | null) => void;

    login: (email: string, password: string) => Promise<void>;
    register: (data: RegisterInput) => Promise<void>;
    logout: () => Promise<void>;
    socialLogin: (provider: "google" | "apple" | "facebook") => Promise<void>;
    resetPassword: (email: string) => Promise<void>;
    resendConfirmation: (email: string) => Promise<void>;
    updateProfile: (data: ProfileInput) => Promise<void>;
    updatePassword: (
        currentPassword: string,
        newPassword: string,
    ) => Promise<void>;
    syncProfile: (profile: Partial<User>) => void;
    fetchAndSyncRole: () => Promise<void>;
}

// --- Store ---

export const useAuthStore = create<AuthState>((set, get) => {
    /** Wraps an async action with isLoading state management. */
    const withLoading = <T>(fn: () => Promise<T>): Promise<T> => {
        set({ isLoading: true });
        return fn().finally(() => set({ isLoading: false }));
    };

    return {
        user: null,
        supabaseUser: null,
        session: null,
        authStep: "email",
        email: "",
        redirectTo: null,
        isLoading: true,
        isAuthModalOpen: false,

        setAuthStep: (authStep) => set({ authStep }),
        setEmail: (email) => set({ email }),
        openAuthModal: (step = 'email', redirectTo?: string) =>
            set({
                isAuthModalOpen: true,
                authStep: step,
                redirectTo: redirectTo ?? get().redirectTo,
            }),
        closeAuthModal: () => set({ isAuthModalOpen: false, redirectTo: null }),

        syncSession: (session) => {
            set(
                session?.user
                    ? {
                        session,
                        supabaseUser: session.user,
                        user: extractUserProfile(session.user),
                        isLoading: false,
                    }
                    : { session: null, supabaseUser: null, user: null, isLoading: false },
            );
        },

        login: async (email, password) => {
            loginSchema.parse({ email, password });
            set({ email });
            return withLoading(async () => {
                const { data, error } = await getSupabase().auth.signInWithPassword({
                    email,
                    password,
                });
                if (error) {
                    if (error.message?.toLowerCase().includes("email not confirmed")) {
                        set({ authStep: "verify-email" });
                    }
                    throw error;
                }
                if (data.user && data.session) get().syncSession(data.session);
            });
        },

        register: async (data) => {
            registerSchema.parse(data);
            set({ email: data.email });
            return withLoading(async () => {
                const { data: authData, error } = await getSupabase().auth.signUp({
                    email: data.email,
                    password: data.password,
                    options: {
                        emailRedirectTo: buildRedirectUrl(
                            "/auth/callback",
                            get().redirectTo || undefined,
                        ),
                        data: {
                            first_name: data.firstName,
                            last_name: data.lastName,
                            full_name: `${data.firstName} ${data.lastName}`,
                        },
                    },
                });
                if (error) throw error;

                if (authData.user) {
                    authData.session
                        ? get().syncSession(authData.session)
                        : set({ authStep: "verify-email" });
                }
            });
        },

        logout: () =>
            withLoading(async () => {
                const { error } = await getSupabase().auth.signOut();
                if (error) throw error;
                get().syncSession(null);
            }),

        socialLogin: async (provider) => {
            set({ isLoading: true });
            const { error } = await getSupabase().auth.signInWithOAuth({
                provider,
                options: {
                    redirectTo: buildRedirectUrl(
                        "/auth/callback",
                        get().redirectTo || undefined,
                    ),
                },
            });
            if (error) {
                set({ isLoading: false });
                throw error;
            }
            // No finally — page redirects on success, loading stays true
        },

        resetPassword: (email) => {
            emailSchema.parse({ email });
            return withLoading(async () => {
                const { error } = await getSupabase().auth.resetPasswordForEmail(email, {
                    redirectTo: `${window.location.origin}/auth/reset-password`,
                });
                if (error) throw error;
            });
        },

        resendConfirmation: (email) => {
            emailSchema.parse({ email });
            return withLoading(async () => {
                const { error } = await getSupabase().auth.resend({
                    type: "signup",
                    email,
                    options: { emailRedirectTo: buildRedirectUrl() },
                });
                if (error) throw error;
            });
        },

        updateProfile: (data) => {
            profileSchema.parse(data);
            return withLoading(async () => {
                const { data: userData, error } = await getSupabase().auth.updateUser({
                    data: {
                        first_name: data.firstName,
                        last_name: data.lastName,
                        full_name: `${data.firstName} ${data.lastName}`,
                    },
                });
                if (error) throw error;
                if (userData.user) {
                    set({
                        user: extractUserProfile(userData.user),
                        supabaseUser: userData.user,
                    });
                }
            });
        },

        updatePassword: (currentPassword, newPassword) => {
            updatePasswordSchema.parse({ currentPassword, newPassword });
            return withLoading(async () => {
                const { user } = get();
                if (!user?.email) throw new Error("No user logged in");

                const { error: signInError } = await getSupabase().auth.signInWithPassword({
                    email: user.email,
                    password: currentPassword,
                });
                if (signInError) throw new Error("Current password is incorrect");

                const { error } = await getSupabase().auth.updateUser({
                    password: newPassword,
                });
                if (error) throw error;
            });
        },
        syncProfile: (profile) => {
            const { user } = get();
            if (user) {
                set({
                    user: {
                        ...user,
                        ...profile
                    }
                });
            }
        },
        fetchAndSyncRole: async () => {
            const { user } = get();
            if (!user?.id) return;

            try {
                const supabase = getSupabase();
                const { data: profile, error } = await supabase
                    .from('profiles')
                    .select('role')
                    .eq('id', user.id)
                    .single();

                if (!error && profile?.role) {
                    set({
                        user: { ...get().user!, role: profile.role as 'user' | 'admin' },
                    });
                }
            } catch (err) {
                // Silent fallback — stale user_metadata role is used
                console.error('[authStore] Failed to fetch profile role:', err);
            }
        },
    };
});

// Selectors
export const useUser = () => useAuthStore((s) => s.user);
export const useSession = () => useAuthStore((s) => s.session);
export const useAuthStep = () => useAuthStore((s) => s.authStep);
export const useAuthLoading = () => useAuthStore((s) => s.isLoading);