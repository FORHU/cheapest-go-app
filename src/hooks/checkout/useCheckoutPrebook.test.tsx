import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useCheckoutPrebook } from './useCheckoutPrebook';

/**
 * Checkout, while the supplier is quiet.
 *
 * An empty availability answer is usually momentary — seconds — and a guest spends far longer
 * than that typing names, an email and a phone number. Reporting the first refusal put a red
 * panel in front of someone whose booking was never actually at risk, and the only way out
 * was a page reload. These re-attempts run underneath the form instead.
 *
 * They must also stop: a page nobody is looking at has no guest waiting on it, and traffic
 * generated on spec is what OTV's contract objects to.
 */

const selectedRoom = { offerId: 'TGX:abc', title: 'Deluxe Double' };

vi.mock('@/stores/bookingStore', () => ({
    useSelectedRoom: () => selectedRoom,
    useGuestCount: () => ({ adults: 2, children: 0 }),
}));
vi.mock('@/stores/authStore', () => ({
    useUser: () => null,
    useAuthStore: () => ({ isAuthModalOpen: false }),
}));

const UNAVAILABLE = 'Availability for this room could not be confirmed. Please try again in a moment.';

function setHidden(hidden: boolean) {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
}

describe('useCheckoutPrebook — quiet re-attempts', () => {
    beforeEach(() => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        setHidden(false);
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('keeps trying underneath the form instead of reporting the first refusal', async () => {
        const startPrebook = vi.fn()
            .mockRejectedValueOnce(new Error(UNAVAILABLE))
            .mockResolvedValue({ prebookId: 'pb_1' });

        const { result } = renderHook(() =>
            useCheckoutPrebook({ selectedCurrency: 'KRW', startPrebook, prebookError: null }),
        );

        // The refusal is absorbed: the guest is told it is still being confirmed, not that it failed.
        await waitFor(() => expect(result.current.confirming).toBe(true));

        await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });

        expect(startPrebook).toHaveBeenCalledTimes(2);
        await waitFor(() => expect(result.current.confirming).toBe(false));
    });

    it('gives up eventually rather than retrying for ever', async () => {
        const startPrebook = vi.fn().mockRejectedValue(new Error(UNAVAILABLE));

        const { result } = renderHook(() =>
            useCheckoutPrebook({ selectedCurrency: 'KRW', startPrebook, prebookError: null }),
        );

        await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });

        // One opening attempt plus the six scheduled ones, and then it stops.
        expect(startPrebook).toHaveBeenCalledTimes(7);
        await waitFor(() => expect(result.current.confirming).toBe(false));
    });

    it('does not keep calling the supplier for a tab nobody is looking at', async () => {
        const startPrebook = vi.fn().mockRejectedValue(new Error(UNAVAILABLE));

        renderHook(() =>
            useCheckoutPrebook({ selectedCurrency: 'KRW', startPrebook, prebookError: null }),
        );

        await waitFor(() => expect(startPrebook).toHaveBeenCalledTimes(1));
        setHidden(true);

        await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });

        // The scheduled attempt fires, sees a hidden page and declines to call out.
        expect(startPrebook).toHaveBeenCalledTimes(1);
    });

    it('stops re-attempting for a failure that trying again cannot fix', async () => {
        // A rate limit or a malformed offer is not the supplier being quiet; repeating it
        // just spends the guest's time.
        const startPrebook = vi.fn().mockRejectedValue(new Error('Too many requests. Please wait a moment.'));

        const { result } = renderHook(() =>
            useCheckoutPrebook({ selectedCurrency: 'KRW', startPrebook, prebookError: null }),
        );

        await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });

        expect(startPrebook).toHaveBeenCalledTimes(1);
        expect(result.current.confirming).toBe(false);
    });

    it('schedules nothing once the page is gone', async () => {
        const startPrebook = vi.fn().mockRejectedValue(new Error(UNAVAILABLE));

        const { unmount } = renderHook(() =>
            useCheckoutPrebook({ selectedCurrency: 'KRW', startPrebook, prebookError: null }),
        );

        await waitFor(() => expect(startPrebook).toHaveBeenCalledTimes(1));
        unmount();

        await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });

        expect(startPrebook).toHaveBeenCalledTimes(1);
    });
});
