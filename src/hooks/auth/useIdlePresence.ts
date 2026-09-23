'use client';

import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { shouldSendPresencePing } from './presenceThrottle';

/**
 * Client half of the Idle Limit (CONTEXT.md, ADR-0027). The server is the actual
 * enforcement (`getSession()` in `session.ts`) — this hook only:
 *
 *   1. Tells the server about real Presence — a click, keypress, scroll or touch —
 *      throttled to at most one `/api/auth/presence` call a minute, so an active
 *      traveller's session keeps surviving.
 *   2. Notices when the server has signed someone out for being idle, and prompts them to
 *      sign in again instead of leaving stale "signed in" UI up.
 *
 * Deliberately keyed off real DOM activity events, not a bare timer and not tab visibility
 * — CONTEXT.md: "a tab can be in front of an empty chair", and pages that poll themselves
 * are exactly the traffic an Idle Limit exists to see through. The liveness poll below is
 * safe on that count because it only *reads* `/api/auth/me`; it never calls the presence
 * endpoint, so it can never itself keep an unattended session alive.
 */

/** How often to check whether the session survived, independent of any click. */
export const SESSION_LIVENESS_POLL_MS = 60_000;

const ACTIVITY_EVENTS = ['click', 'keydown', 'scroll', 'touchstart'] as const;

export function useIdlePresence(): void {
    const isSignedIn = useAuthStore((s) => s.user !== null);
    const setUser = useAuthStore((s) => s.setUser);
    const openAuthModal = useAuthStore((s) => s.openAuthModal);
    const lastPingRef = useRef<number | null>(null);

    useEffect(() => {
        if (!isSignedIn) return;

        let cancelled = false;
        const signOutForIdle = () => {
            if (cancelled) return;
            setUser(null);
            openAuthModal('email');
        };

        const ping = () => {
            const now = Date.now();
            if (!shouldSendPresencePing(lastPingRef.current, now)) return;
            lastPingRef.current = now;
            fetch('/api/auth/presence', { method: 'POST', headers: { 'X-Requested-By': 'cheapestgo-client' } })
                .then((res) => {
                    if (res.status === 401) signOutForIdle();
                })
                .catch(() => {
                    // Offline. Leave the session alone — the server, not a failed fetch,
                    // is the source of truth for whether it has idled out.
                });
        };

        const checkLiveness = () => {
            fetch('/api/auth/me', { headers: { 'X-Requested-By': 'cheapestgo-client' } })
                .then((res) => {
                    if (res.status === 401) signOutForIdle();
                })
                .catch(() => {});
        };

        for (const evt of ACTIVITY_EVENTS) {
            window.addEventListener(evt, ping, { passive: true });
        }
        const liveness = setInterval(checkLiveness, SESSION_LIVENESS_POLL_MS);

        return () => {
            cancelled = true;
            for (const evt of ACTIVITY_EVENTS) {
                window.removeEventListener(evt, ping);
            }
            clearInterval(liveness);
        };
    }, [isSignedIn, setUser, openAuthModal]);
}
