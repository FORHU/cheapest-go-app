"use client";

/**
 * AuthListener — initialises the client-side auth state on page load, and watches the
 * Idle Limit for as long as the page stays open.
 *
 * After Supabase migration this component polls /api/auth/me once on mount
 * instead of using Supabase's real-time onAuthStateChange subscription.
 * The Lucia session cookie is validated server-side on every request by
 * the middleware, so no polling is needed for security — this is only
 * for hydrating the Zustand store with the current user on initial render.
 *
 * Mounted once, in the root layout, which is what makes it the wiring point for
 * `useIdlePresence` (CONTEXT.md "Idle Limit", ADR-0027) — every page gets Presence
 * tracking and the idled-out prompt without having to remember to add it itself.
 */

import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useIdlePresence } from '@/hooks/auth/useIdlePresence';

export const AuthListener = () => {
    const { initSession, fetchAndSyncRole } = useAuthStore();

    useEffect(() => {
        const init = async () => {
            await initSession();
            await fetchAndSyncRole();
        };
        init();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useIdlePresence();

    return null;
};
