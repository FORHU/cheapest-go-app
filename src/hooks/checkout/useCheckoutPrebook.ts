'use client';

import { useEffect, useRef } from 'react';
import { useSelectedRoom } from '@/stores/bookingStore';
import { useAuthStore, useUser } from '@/stores/authStore';

interface UseCheckoutPrebookOptions {
    selectedCurrency: string;
    startPrebook: (offerId: string, currency: string) => Promise<any>;
    prebookError: string | null;
}

interface UseCheckoutPrebookReturn {
    retryPrebook: () => void;
}

/**
 * Hook to manage prebook triggering logic for checkout.
 * Handles initial prebook, currency change re-prebook, and auth retry.
 */
export function useCheckoutPrebook({
    selectedCurrency,
    startPrebook,
    prebookError,
}: UseCheckoutPrebookOptions): UseCheckoutPrebookReturn {
    const user = useUser();
    const selectedRoom = useSelectedRoom();
    const { isAuthModalOpen } = useAuthStore();
    const prebookInitiatedRef = useRef<string | null>(null);
    // Tracks keys that permanently failed (room unavailable) — never retry these
    const prebookFailedRef = useRef<Set<string>>(new Set());

    // Prebook trigger on mount/currency change
    useEffect(() => {
        const prebookKey = `${selectedRoom?.offerId}-${selectedCurrency}`;
        if (
            selectedRoom?.offerId &&
            prebookInitiatedRef.current !== prebookKey &&
            !prebookFailedRef.current.has(prebookKey)
        ) {
            prebookInitiatedRef.current = prebookKey;
            startPrebook(selectedRoom.offerId, selectedCurrency).catch((_err: Error) => {
                // Mark permanently failed so the effect never re-triggers
                prebookFailedRef.current.add(prebookKey);
                prebookInitiatedRef.current = prebookKey;
            });
        }
    }, [selectedRoom?.offerId, selectedCurrency, startPrebook]);

    // Auto-retry prebook after auth — only for auth errors, never for unavailable rooms
    useEffect(() => {
        const prebookKey = `${selectedRoom?.offerId}-${selectedCurrency}`;
        const isUnavailable = /no longer available|not available|unavailable|sold out|no availability/i.test(prebookError || '');
        if (user && prebookError && !isUnavailable && selectedRoom?.offerId && !isAuthModalOpen) {
            prebookInitiatedRef.current = null;
            prebookFailedRef.current.delete(prebookKey);
            startPrebook(selectedRoom.offerId, selectedCurrency).catch(console.error);
        }
    }, [user, prebookError, selectedRoom?.offerId, isAuthModalOpen, startPrebook, selectedCurrency]);

    // Manual retry function — only works for non-unavailability errors
    const retryPrebook = () => {
        const prebookKey = `${selectedRoom?.offerId}-${selectedCurrency}`;
        prebookInitiatedRef.current = null;
        prebookFailedRef.current.delete(prebookKey);
        if (selectedRoom?.offerId) {
            startPrebook(selectedRoom.offerId, selectedCurrency);
        }
    };

    return { retryPrebook };
}
