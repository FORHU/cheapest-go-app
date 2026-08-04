import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

/**
 * The Trips cards used to read the display currency in a `useEffect` with an
 * empty dependency array, so the amount froze at whatever currency was active
 * on mount and the header's currency selector did nothing until a full page
 * reload. These cover the fix: a currency change must reach the rendered price.
 */

let currentCurrency = 'USD';

vi.mock('@/stores/searchStore', () => ({
    useUserCurrency: () => currentCurrency,
}));

vi.mock('@/lib/currency', () => ({
    // 1 USD = 56 PHP, enough to make the conversion unmistakable on screen.
    convertCurrency: (amount: number, from: string, to: string) => {
        if (from === to) return amount;
        if (from === 'USD' && to === 'PHP') return amount * 56;
        if (from === 'PHP' && to === 'USD') return amount / 56;
        return amount;
    },
}));

vi.mock('next-intl', () => ({
    useTranslations: () => Object.assign((k: string) => k, { rich: (k: string) => k }),
}));

vi.mock('framer-motion', () => ({
    motion: new Proxy({}, { get: () => (p: any) => React.createElement('div', null, p.children) }),
}));

vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('../../components/trips/CancellationModal', () => ({ default: () => null }));
vi.mock('../../components/trips/ModificationModal', () => ({ default: () => null }));

import BookingCard from '@/components/trips/BookingCard';

const booking: any = {
    id: 'bk_1',
    total_price: 139,
    currency: 'USD',
    status: 'confirmed',
    check_in: '2026-09-01',
    check_out: '2026-09-03',
    hotel_name: 'Test Hotel',
    property_name: 'Test Hotel',
};

beforeEach(() => {
    currentCurrency = 'USD';
    vi.clearAllMocks();
});

describe('Trips card currency conversion', () => {
    it('renders the booking amount in the selected currency', async () => {
        currentCurrency = 'PHP';
        const { container } = render(<BookingCard booking={booking} />);
        // 139 USD × 56 = 7,784 PHP
        await waitFor(() => {
            expect(container.textContent).toMatch(/7,?784/);
        });
    });

    it('updates the amount when the selector changes currency', async () => {
        currentCurrency = 'USD';
        const { container, rerender } = render(<BookingCard booking={booking} />);
        await waitFor(() => expect(container.textContent).toMatch(/139/));

        // The header selector switching to PHP re-renders these cards.
        currentCurrency = 'PHP';
        rerender(<BookingCard booking={booking} />);

        // Before the fix this stayed at 139 — the effect had [] deps and never re-ran.
        await waitFor(() => {
            expect(container.textContent).toMatch(/7,?784/);
        });
    });

    it('switches back when the traveller returns to the original currency', async () => {
        currentCurrency = 'PHP';
        const { container, rerender } = render(<BookingCard booking={booking} />);
        await waitFor(() => expect(container.textContent).toMatch(/7,?784/));

        currentCurrency = 'USD';
        rerender(<BookingCard booking={booking} />);
        await waitFor(() => expect(container.textContent).toMatch(/139/));
    });
});
