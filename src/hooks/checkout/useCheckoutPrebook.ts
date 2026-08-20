'use client';

import { useEffect, useRef } from 'react';
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
    const { adults, children } = useGuestCount();
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
            startPrebook(selectedRoom.offerId, selectedCurrency, undefined, adults, children, selectedRoom.title).catch((_err: Error) => {
                // Mark permanently failed so the effect never re-triggers
                prebookFailedRef.current.add(prebookKey);
                prebookInitiatedRef.current = prebookKey;
            });
        }
    }, [selectedRoom?.offerId, selectedCurrency, startPrebook, adults, children]);

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
    }, [user, prebookError, selectedRoom?.offerId, isAuthModalOpen, startPrebook, selectedCurrency]);

    // Manual retry function — only works for non-unavailability errors
    const retryPrebook = () => {
        const prebookKey = `${selectedRoom?.offerId}-${selectedCurrency}`;
        prebookInitiatedRef.current = null;
        prebookFailedRef.current.delete(prebookKey);
        if (selectedRoom?.offerId) {
            startPrebook(selectedRoom.offerId, selectedCurrency, undefined, adults, children, selectedRoom.title);
        }
    };

    return { retryPrebook };
}
