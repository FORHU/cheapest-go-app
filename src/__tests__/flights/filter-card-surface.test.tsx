import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/locales/en.json';

/**
 * The search page's filter panel sits beside the result cards and is drawn as one of
 * them: the same border, corner radius, resting shadow and hover lift — one surface,
 * defined once, so the two cannot drift apart again.
 */

// The card's root is a motion.div; keep its className so the surface can be read.
vi.mock('framer-motion', () => ({
    // Only the card's root fades in on mount (initial.opacity 0); tag that one, not the
    // rail and column, which are motion elements too.
    motion: new Proxy({}, { get: () => (p: any) => React.createElement('div', { className: p.className, 'data-testid': p.initial?.opacity === 0 && p.initial?.y ? 'motion-root' : undefined }, p.children) }),
    AnimatePresence: ({ children }: any) => React.createElement(React.Fragment, null, children),
}));
vi.mock('@/stores/searchStore', () => ({ useUserCurrency: () => 'USD' }));
vi.mock('@/components/common/SaveButton', () => ({ default: () => null }));

import { FlightCard } from '@/components/flights/flightCard';
import { FilterCard, RESULT_CARD_SURFACE } from '@/components/flights/FilterCard';
import type { FlightOffer } from '@/types/flights';

const offer = {
    offerId: 'off_1',
    provider: 'duffel',
    price: { total: 500, base: 400, taxes: 100, currency: 'USD', pricePerAdult: 500 },
    segments: [{
        segmentIndex: 0,
        airline: { code: 'QR', name: 'Qatar Airways' },
        origin: 'CRK', destination: 'DOH', flightNumber: 'QR0927',
        departure: { airport: 'CRK', time: '2026-09-23T18:40:00' },
        arrival: { airport: 'DOH', time: '2026-09-23T22:30:00' },
        duration: 530, stops: 0, cabinClass: 'economy',
    }],
    sliceDurations: [530], totalDuration: 530, totalStops: 0, refundable: false, tripType: 'one-way',
} as FlightOffer;

const surfaceClasses = RESULT_CARD_SURFACE.split(/\s+/).filter(Boolean);

describe('FilterCard', () => {
    it('holds the filter panel content', () => {
        render(<FilterCard><p>filters</p></FilterCard>);
        expect(screen.getByText('filters')).toBeInTheDocument();
    });

    it('draws the border, radius and shadow of a result card, with its hover lift', () => {
        render(<FilterCard><p>filters</p></FilterCard>);
        const card = screen.getByText('filters').parentElement!;
        expect(card).toHaveClass(...surfaceClasses);
        expect(RESULT_CARD_SURFACE).toContain('hover:shadow-');
        expect(RESULT_CARD_SURFACE).toContain('hover:border-');
    });

    it('is the very surface the flight card rests on', () => {
        render(
            <NextIntlClientProvider locale="en" messages={en as never} timeZone="UTC">
                <FlightCard offer={offer} />
            </NextIntlClientProvider>,
        );
        expect(screen.getByTestId('motion-root')).toHaveClass(...surfaceClasses);
    });
});
