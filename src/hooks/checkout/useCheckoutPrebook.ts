'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSelectedRoom, useGuestCount } from '@/stores/bookingStore';
import { useAuthStore, useUser } from '@/stores/authStore';
import { isRoomUnavailableError } from '@/lib/utils';

interface UseCheckoutPrebookOptions {
    selectedCurrency: string;
    startPrebook: (offerId: string, currency: string, voucherCode?: string, adults?: number, children?: number, roomName?: string) => Promise<any>;
    prebookError: string | null;
}

interface UseCheckoutPrebookReturn {
    retryPrebook: () => void;
    /** A background attempt is pending: the room is not confirmed, but nothing has gone wrong yet. */
    confirming: boolean;
}

/**
 * How long to wait before each background re-attempt, in order.
 *
 * The supplier goes quiet for seconds at a time — an empty availability answer with a success
 * status, across every hotel — and a guest spends thirty to ninety seconds typing names, an
 * email and a phone number. Retrying across that window hides nearly every outage from the
 * person it would otherwise have stopped.
 *
 * Spaced rather than tight, and finite: six attempts over about ninety-five seconds is roughly
 * four calls a minute at its busiest, which is a guest waiting on a page rather than traffic
 * generated on spec — the distinction OTV's contract draws. It stops on the first success, on
 * leaving the page, and while the tab is hidden.
 */
const RETRY_BACKOFF_MS = [5_000, 10_000, 15_000, 20_000, 25_000, 20_000];

/**
 * Hook to manage prebook triggering logic for checkout.
 * Handles initial prebook, background re-attempts, currency change re-prebook, and auth retry.
 */
export function useCheckoutPrebook({
    selectedCurrency,
    startPrebook,
    prebookError,
}: UseCheckoutPrebookOptions): UseCheckoutPrebookReturn {
    const user = useUser();
    const selectedRoom = useSelectedRoom();
    const { adults, children } = useGuestCount();
    const { isAuthModalOpen } = useAuthStore();
    const prebookInitiatedRef = useRef<string | null>(null);
    // Tracks keys that have exhausted their background attempts — only a deliberate retry
    // (or a reload) starts them again.
    const prebookFailedRef = useRef<Set<string>>(new Set());
    const attemptRef = useRef(0);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [confirming, setConfirming] = useState(false);

    const clearTimer = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    /**
     * Run a prebook, and on a retryable refusal schedule the next one rather than reporting it.
     *
     * "Retryable" is every unavailability answer, because the supplier cannot tell us the
     * difference between a room that is gone and a minute in which it is serving nothing —
     * and the second is far more common. A room that really is gone simply exhausts the
     * attempts and reports itself, about a minute and a half later, by which time the guest
     * has usually finished typing anyway.
     */
    const attempt = useCallback((offerId: string, prebookKey: string) => {
        startPrebook(offerId, selectedCurrency, undefined, adults, children, selectedRoom?.title)
            .then(() => {
                attemptRef.current = 0;
                setConfirming(false);
            })
            .catch((err: Error) => {
                const delay = RETRY_BACKOFF_MS[attemptRef.current];
                if (delay === undefined || !isRoomUnavailableError(err?.message)) {
                    // Out of attempts, or a failure retrying cannot help with (a bad offer, a
                    // rate limit, an auth problem). Report it.
                    prebookFailedRef.current.add(prebookKey);
                    prebookInitiatedRef.current = prebookKey;
                    setConfirming(false);
                    return;
                }
                attemptRef.current += 1;
                setConfirming(true);
                clearTimer();
                timerRef.current = setTimeout(() => {
                    // A hidden tab is a guest who has gone elsewhere; the visibility handler
                    // picks this up again when they come back.
                    if (typeof document !== 'undefined' && document.hidden) return;
                    attempt(offerId, prebookKey);
                }, delay);
            });
    }, [startPrebook, selectedCurrency, adults, children, selectedRoom?.title, clearTimer]);

    // Prebook trigger on mount/currency change
    useEffect(() => {
        const prebookKey = `${selectedRoom?.offerId}-${selectedCurrency}`;
        if (
            selectedRoom?.offerId &&
            prebookInitiatedRef.current !== prebookKey &&
            !prebookFailedRef.current.has(prebookKey)
        ) {
            prebookInitiatedRef.current = prebookKey;
            attemptRef.current = 0;
            attempt(selectedRoom.offerId, prebookKey);
        }
    }, [selectedRoom?.offerId, selectedRoom?.title, selectedCurrency, attempt]);

    // Resume a pending attempt when the guest comes back to the tab.
    useEffect(() => {
        const onVisible = () => {
            if (document.hidden || !confirming || timerRef.current) return;
            const prebookKey = `${selectedRoom?.offerId}-${selectedCurrency}`;
            if (selectedRoom?.offerId) attempt(selectedRoom.offerId, prebookKey);
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => document.removeEventListener('visibilitychange', onVisible);
    }, [confirming, selectedRoom?.offerId, selectedCurrency, attempt]);

    // Nothing should still be scheduled once this page is gone.
    useEffect(() => clearTimer, [clearTimer]);

    // Auto-retry prebook after auth — only for auth errors, never for unavailable rooms or rate-limit errors
    useEffect(() => {
        const prebookKey = `${selectedRoom?.offerId}-${selectedCurrency}`;
        const isUnavailable = isRoomUnavailableError(prebookError);
        const isRateLimit = !!prebookError && /too many requests/i.test(prebookError);
        if (user && prebookError && !isUnavailable && !isRateLimit && selectedRoom?.offerId && !isAuthModalOpen) {
            prebookInitiatedRef.current = null;
            prebookFailedRef.current.delete(prebookKey);
            startPrebook(selectedRoom.offerId, selectedCurrency, undefined, adults, children, selectedRoom.title).catch(console.error);
        }
    }, [user, prebookError, selectedRoom?.offerId, selectedRoom?.title, isAuthModalOpen, startPrebook, selectedCurrency, adults, children]);

    // Manual retry — starts the background attempts over from the beginning.
    const retryPrebook = () => {
        const prebookKey = `${selectedRoom?.offerId}-${selectedCurrency}`;
        clearTimer();
        attemptRef.current = 0;
        prebookInitiatedRef.current = null;
        prebookFailedRef.current.delete(prebookKey);
        if (selectedRoom?.offerId) attempt(selectedRoom.offerId, prebookKey);
    };

    return { retryPrebook, confirming };
}
