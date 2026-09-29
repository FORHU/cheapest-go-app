import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/locales/en.json';

/**
 * The payment step on the flight book page wears the book page's card — the search
 * page's card surface, a blue glyph beside a 16px title, 12px fields outlined in grey
 * that turn blue, and the blue pill button — while the hotel checkout keeps its own.
 */

const elementsOptions = vi.fn();
vi.mock('@stripe/stripe-js', () => ({ loadStripe: () => Promise.resolve(null) }));
vi.mock('@stripe/react-stripe-js', () => ({
    Elements: ({ options, children }: any) => { elementsOptions(options); return <>{children}</>; },
    PaymentElement: () => <div data-testid="payment-element" />,
    useStripe: () => ({}),
    useElements: () => ({}),
}));
vi.mock('@/components/context/ThemeContext', () => ({ useTheme: () => ({ theme: 'light', toggleTheme: () => {} }) }));

import StripeEmbeddedCheckout, { bookPaymentAppearance } from '@/components/checkout/StripeEmbeddedCheckout';
import { RESULT_CARD_RESTING } from '@/components/flights/FilterCard';

function renderCheckout(props: Partial<React.ComponentProps<typeof StripeEmbeddedCheckout>> = {}) {
    return render(
        <NextIntlClientProvider locale="en" messages={en as never} timeZone="UTC">
            <StripeEmbeddedCheckout clientSecret="pi_secret" onSuccess={() => {}} {...props} />
        </NextIntlClientProvider>,
    );
}

describe('StripeEmbeddedCheckout — flight book variant', () => {
    it('sits on the book page card with its heading', () => {
        renderCheckout({ variant: 'flightBook' });
        const heading = screen.getByRole('heading', { name: 'Complete Payment' });
        const card = heading.closest('form')!;
        expect(card).toHaveClass(...RESULT_CARD_RESTING.split(/\s+/).filter(Boolean));
        expect(heading).toHaveClass('text-[15px]', 'lg:text-[16px]', 'font-normal');
    });

    it('pays from the blue pill button', () => {
        renderCheckout({ variant: 'flightBook' });
        expect(screen.getByRole('button', { name: 'Pay Now' })).toHaveClass('rounded-full', 'bg-blue-600');
    });

    it('hands Stripe the book page field look', () => {
        renderCheckout({ variant: 'flightBook' });
        expect(elementsOptions).toHaveBeenLastCalledWith(expect.objectContaining({ appearance: bookPaymentAppearance('light') }));
    });

    it('leaves the hotel checkout as it was', () => {
        renderCheckout();
        expect(screen.getByRole('button', { name: 'Pay Now' })).toHaveClass('bg-indigo-600');
        expect(elementsOptions).toHaveBeenLastCalledWith(expect.objectContaining({ appearance: { theme: 'stripe' } }));
    });
});

describe('bookPaymentAppearance', () => {
    it('draws 12px fields outlined in the book page grey, blue while focused', () => {
        const look = bookPaymentAppearance('light');
        expect(look.variables?.borderRadius).toBe('12px');
        expect(look.variables?.colorPrimary).toBe('#2563eb');
        expect(look.rules?.['.Input']).toMatchObject({ border: '1px solid #d9d9d9', boxShadow: 'none' });
        expect(look.rules?.['.Input:focus']).toMatchObject({ borderColor: '#2563eb' });
    });

    it('follows the dark theme', () => {
        expect(bookPaymentAppearance('dark').theme).toBe('night');
    });
});
