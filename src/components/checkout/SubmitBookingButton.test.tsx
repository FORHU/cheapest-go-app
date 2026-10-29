import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/locales/en.json';
import { SubmitBookingButton } from './SubmitBookingButton';

/**
 * The button, when the supplier says the room cannot be confirmed.
 *
 * That answer is usually transient: during an **Availability Blackout** every hotel returns it
 * and recovers within seconds. The page used to offer only "go back and choose a different
 * hotel" — which sends the guest to a list where everything is failing for the same reason —
 * and the prebook key was marked failed so returning to checkout would not re-run it. A browser
 * reload was the only way through, which is how this was found.
 */

vi.mock('@/stores/checkoutStore', () => ({
    useCheckoutStore: (selector: (s: unknown) => unknown) => selector({ selectedCurrency: 'USD' }),
}));

const base = {
    loading: false,
    prebooking: false,
    prebookId: null,
    priceReady: false,
    isAuthenticated: true,
    totalPrice: 100,
    onSubmit: vi.fn(),
};

function renderButton(props: Partial<React.ComponentProps<typeof SubmitBookingButton>>) {
    return render(
        <NextIntlClientProvider locale="en" messages={en as never}>
            <SubmitBookingButton {...base} prebookError={null} {...props} />
        </NextIntlClientProvider>,
    );
}

/** What the API returns after its retries are exhausted. */
const UNCONFIRMED = 'Availability for this room could not be confirmed. Please try again in a moment.';

describe('SubmitBookingButton — room could not be confirmed', () => {
    it('offers a retry in place rather than only sending the guest away', () => {
        const onRetry = vi.fn();
        renderButton({ prebookError: UNCONFIRMED, onRetry });

        fireEvent.click(screen.getByRole('button', { name: en.checkout.retry }));
        expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('still lets them leave, as a secondary action', () => {
        renderButton({ prebookError: UNCONFIRMED, onRetry: vi.fn() });
        expect(screen.getByRole('button', { name: en.checkout.submit.goBackDifferentHotel })).toBeInTheDocument();
    });

    it('does not tell them to pick another hotel as the primary action', () => {
        renderButton({ prebookError: UNCONFIRMED, onRetry: vi.fn() });

        const primary = screen.getAllByRole('button')[0];
        expect(primary).toHaveTextContent(en.checkout.retry);
    });

    it('falls back to going back when no retry is wired', () => {
        renderButton({ prebookError: UNCONFIRMED });

        expect(screen.queryByRole('button', { name: en.checkout.retry })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: en.checkout.submit.goBackDifferentHotel })).toBeInTheDocument();
    });

    it('leaves a healthy checkout alone', () => {
        renderButton({ prebookError: null, prebookId: 'pb_1', priceReady: true, onRetry: vi.fn() });

        expect(screen.queryByRole('button', { name: en.checkout.retry })).not.toBeInTheDocument();
    });
});
