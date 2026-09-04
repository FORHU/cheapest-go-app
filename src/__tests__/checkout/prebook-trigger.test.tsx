import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

/**
 * Checkout used to fire two prebooks per page load.
 *
 * `checkoutStore` defaults `selectedCurrency` to KRW and persists it, so on
 * `/checkout?currency=PHP` the first render prebooked whatever the store held, an effect
 * then synced the currency from the URL, and the trigger below fired again for PHP. Every
 * load cost two live TGX searches — one in a currency nobody asked for — and five loads a
 * minute exhausted the prebook allowance, which is what QA saw as stacked
 * "Too many requests" toasts.
 *
 * The fix is in `CheckoutContent`: the URL's currency is resolved during render and passed
 * here, so the first prebook is already the right one. These tests pin the hook contract
 * that makes it work — one call per (offer, currency) key, and a second call whenever that
 * key changes.
 */

vi.mock('@/stores/bookingStore', () => ({
    useSelectedRoom: () => ({ offerId: 'TGX:offer-1', title: 'Standard Double room' }),
    useGuestCount: () => ({ adults: 2, children: 0 }),
}));

vi.mock('@/stores/authStore', () => ({
    useAuthStore: () => ({ isAuthModalOpen: false }),
    useUser: () => null,
}));

import { useCheckoutPrebook } from '@/hooks/checkout/useCheckoutPrebook';

describe('useCheckoutPrebook', () => {
    let startPrebook: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        startPrebook = vi.fn().mockResolvedValue({ prebookId: 'pb-1' });
    });

    it('prebooks once when the currency is settled before the first render', () => {
        // What `/checkout?currency=PHP` now does: PHP is known during render, so the
        // trigger never sees an intermediate currency.
        renderHook(() => useCheckoutPrebook({ selectedCurrency: 'PHP', startPrebook, prebookError: null }));

        expect(startPrebook).toHaveBeenCalledTimes(1);
        expect(startPrebook).toHaveBeenCalledWith('TGX:offer-1', 'PHP', undefined, 2, 0, 'Standard Double room');
    });

    it('does not re-prebook when the component re-renders with the same currency', () => {
        const { rerender } = renderHook(
            (props: { currency: string }) => useCheckoutPrebook({
                selectedCurrency: props.currency,
                startPrebook,
                prebookError: null,
            }),
            { initialProps: { currency: 'PHP' } },
        );

        rerender({ currency: 'PHP' });
        rerender({ currency: 'PHP' });

        expect(startPrebook).toHaveBeenCalledTimes(1);
    });

    it('prebooks again when the currency actually changes — the old double-call', () => {
        // This is the behaviour the page used to force on every load by starting at the
        // store's KRW default. The hook is right to re-quote here; the bug was that the
        // page made the change happen when the URL had said PHP all along.
        const { rerender } = renderHook(
            (props: { currency: string }) => useCheckoutPrebook({
                selectedCurrency: props.currency,
                startPrebook,
                prebookError: null,
            }),
            { initialProps: { currency: 'KRW' } },
        );

        rerender({ currency: 'PHP' });

        expect(startPrebook).toHaveBeenCalledTimes(2);
        expect(startPrebook.mock.calls[0]?.[1]).toBe('KRW');
        expect(startPrebook.mock.calls[1]?.[1]).toBe('PHP');
    });

    it('does not retry a rate-limited prebook', () => {
        // Retrying a 429 just deepens it. Only auth failures are worth re-running.
        renderHook(() => useCheckoutPrebook({
            selectedCurrency: 'PHP',
            startPrebook,
            prebookError: 'Too many requests. Please wait a moment.',
        }));

        expect(startPrebook).toHaveBeenCalledTimes(1);
    });
});
