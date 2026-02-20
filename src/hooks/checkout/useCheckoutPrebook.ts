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

    // Prebook trigger on mount/currency change
    useEffect(() => {
        const prebookKey = `${selectedRoom?.offerId}-${selectedCurrency}`;
        if (selectedRoom?.offerId && prebookInitiatedRef.current !== prebookKey) {
            prebookInitiatedRef.current = prebookKey;
            startPrebook(selectedRoom.offerId, selectedCurrency).catch(() => {
                prebookInitiatedRef.current = null;
            });
        }
    }, [selectedRoom?.offerId, selectedCurrency, startPrebook]);

    // Auto-retry prebook after auth
    useEffect(() => {
        if (user && prebookError && selectedRoom?.offerId && !isAuthModalOpen) {
            prebookInitiatedRef.current = null;
            startPrebook(selectedRoom.offerId, selectedCurrency).catch(console.error);
        }
    }, [user, prebookError, selectedRoom?.offerId, isAuthModalOpen, startPrebook, selectedCurrency]);

    // Manual retry function
    const retryPrebook = () => {
        prebookInitiatedRef.current = null;
        if (selectedRoom?.offerId) {
            startPrebook(selectedRoom.offerId, selectedCurrency);
        }
    };

    return { retryPrebook };
}
