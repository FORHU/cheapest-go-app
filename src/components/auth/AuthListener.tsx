"use client";

/**
 * AuthListener — initialises the client-side auth state on page load.
 *
 * After Supabase migration this component polls /api/auth/me once on mount
 * instead of using Supabase's real-time onAuthStateChange subscription.
 * The Lucia session cookie is validated server-side on every request by
 * the middleware, so no polling is needed for security — this is only
 * for hydrating the Zustand store with the current user on initial render.
 */

import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';

export const AuthListener = () => {
    const { initSession, fetchAndSyncRole } = useAuthStore();

    useEffect(() => {
        const init = async () => {
            await initSession();
            await fetchAndSyncRole();
        };
        init();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return null;
};
