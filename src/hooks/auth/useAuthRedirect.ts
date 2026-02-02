'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/stores/authStore';

interface UseAuthRedirectOptions {
    /** Where to redirect if not authenticated */
    redirectTo?: string;
    /** Where to go after successful auth (passed as ?redirect=) */
    returnTo?: string;
    /** If true, redirect immediately when not authenticated */
    requireAuth?: boolean;
}

interface UseAuthRedirectReturn {
    user: ReturnType<typeof useUser>;
    isAuthenticated: boolean;
    /** Redirect to login with return URL */
    redirectToLogin: () => void;
}

/**
 * Hook for auth-based redirects.
 * Uses useEffect to properly handle redirects after mount.
 */
export function useAuthRedirect(options: UseAuthRedirectOptions = {}): UseAuthRedirectReturn {
    const {
        redirectTo = '/login',
        returnTo,
        requireAuth = false,
    } = options;

    const router = useRouter();
    const user = useUser();
    const hasRedirectedRef = useRef(false);

    // Handle redirect for unauthenticated users
    useEffect(() => {
        if (requireAuth && !user && !hasRedirectedRef.current) {
            hasRedirectedRef.current = true;
            const url = returnTo ? `${redirectTo}?redirect=${encodeURIComponent(returnTo)}` : redirectTo;
            router.push(url);
        }

        // Reset ref if user becomes authenticated
        if (user) {
            hasRedirectedRef.current = false;
        }
    }, [requireAuth, user, redirectTo, returnTo, router]);

    const redirectToLogin = () => {
        const url = returnTo ? `${redirectTo}?redirect=${encodeURIComponent(returnTo)}` : redirectTo;
        router.push(url);
    };

    return {
        user,
        isAuthenticated: !!user,
        redirectToLogin,
    };
}
