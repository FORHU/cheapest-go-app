import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, renderHook } from '@testing-library/react';
import en from '@/locales/en.json';

/**
 * Checkout price-breakdown regressions:
 *
 *  1. The tax row vanished the moment a room was confirmed. Prebook reports the
 *     supplier's own split, which is 0 for rates that bake tax into the rate, and
 *     the row was rendered only when `taxes > 0` (and was replaced outright by raw
 *     supplier surcharge rows when the quote carried any).
 *  2. The row is labelled "Taxes" — the platform markup is not itemised, so
 *     calling it "Taxes and fees" promised a fee line that does not exist.
 *  3. "Continue to Payment" showed the pre-markup total rounded to whole units
 *     ($397) while the Total row showed the marked-up charge ($417.30).
 */

let currency = 'USD';

vi.mock('@/stores/checkoutStore', () => ({
    useCheckoutStore: (selector: (s: any) => unknown) => selector({ selectedCurrency: currency }),
}));

vi.mock('@/stores/bookingStore', () => ({
    useProperty: () => ({ name: 'Aberry Shore Resort Hotel', rating: 8.4, image: '' }),
    useSelectedRoom: () => ({ title: 'Standard Double room with balcony', price: 200, currency: 'USD' }),
    useBookingDates: () => ({
        checkIn: new Date('2026-09-25T00:00:00Z'),
        checkOut: new Date('2026-09-27T00:00:00Z'),
    }),
}));

vi.mock('@/lib/currency', () => ({
    getCurrencySymbol: (c: string) => (c === 'USD' ? '$' : c === 'KRW' ? '₩' : c),
    convertCurrency: (amount: number, from: string, to: string) => (from === to ? amount : amount * 2),
}));

// Real English copy, so the assertions below read on the strings a customer sees.
vi.mock('next-intl', () => ({
    useTranslations: (namespace: string) => (key: string, vars?: Record<string, unknown>) => {
        const path = `${namespace}.${key}`.split('.');
        let node: any = en;
        for (const part of path) node = node?.[part];
        if (typeof node !== 'string') return path.join('.');
        return node.replace(/\{(\w+)\}/g, (_m, name) => String(vars?.[name] ?? `{${name}}`));
    },
}));

vi.mock('@/components/checkout/CancellationPolicySection', () => ({
    CancellationPolicySection: () => null,
}));

import { BookingSummary } from '@/components/checkout/BookingSummary';
import { SubmitBookingButton } from '@/components/checkout/SubmitBookingButton';
import { usePricingCalculation } from '@/hooks/checkout/usePricingCalculation';

const summaryProps = {
    propertyName: 'Aberry Shore Resort Hotel',
    roomTitle: 'Standard Double room with balcony',
    roomPrice: 397.43,
    totalNights: 2,
    adults: 2,
    children: 0,
    taxes: 0,
    totalPrice: 397.43,
    prebookId: 'pb_123',
    chargedTotal: 417.30,
};

beforeEach(() => {
    currency = 'USD';
});

describe('BookingSummary price breakdown', () => {
    it('keeps the tax row once the room is confirmed and the supplier quotes tax-inclusive', () => {
        render(<BookingSummary {...summaryProps} />);

        expect(screen.getByText('Taxes')).toBeTruthy();
        expect(screen.getByText('Included')).toBeTruthy();
    });

    it('shows the amount when the supplier does itemise tax', () => {
        render(<BookingSummary {...summaryProps} taxes={19.87} />);

        expect(screen.getByText('Taxes (included)')).toBeTruthy();
        expect(screen.getByText('$19.87')).toBeTruthy();
    });

    it('never labels the row with fees that are not broken out', () => {
        const { container } = render(<BookingSummary {...summaryProps} taxes={19.87} />);

        expect(container.textContent).not.toContain('Taxes and fees');
        expect(container.textContent).not.toContain('Platform service fee');
    });

    it('totals the charge the customer is actually billed', () => {
        render(<BookingSummary {...summaryProps} />);

        expect(screen.getByText('$417.30')).toBeTruthy();
    });
});

describe('Continue to Payment button', () => {
    it('shows the same figure as the summary Total', () => {
        const summary = render(<BookingSummary {...summaryProps} />);
        const total = summary.getByText('$417.30').textContent;

        render(
            <SubmitBookingButton
                loading={false}
                prebooking={false}
                prebookId="pb_123"
                priceReady
                isAuthenticated
                totalPrice={417.30}
                prebookError={null}
                onSubmit={() => {}}
            />
        );

        expect(screen.getByText(`Continue to Payment • ${total}`)).toBeTruthy();
    });
});

describe('usePricingCalculation', () => {
    it('does not invent a tax figure before prebook returns', () => {
        const { result } = renderHook(() => usePricingCalculation({ priceData: null }));

        expect(result.current.taxes).toBe(0);
        // Search prices are already gross, so the pre-prebook total is the room price.
        expect(result.current.totalPrice).toBe(400);
    });

    it('charges the supplier total plus the 5% platform markup', () => {
        const { result } = renderHook(() =>
            usePricingCalculation({
                priceData: { price: 397.43, tax: 0, total: 397.43, currency: 'USD' },
            })
        );

        expect(result.current.totalPrice).toBe(397.43);
        expect(result.current.chargedTotal).toBe(417.30);
    });
});
