import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/locales/en.json';

/**
 * The bug this file exists for: the search results said "1 stop" and the book page said
 * "2 stops" for the same round-trip offer, because the card counted the outbound slice
 * and the book page read the offer-wide `totalStops`. A traveller comparing the two
 * screens had no way to tell which was true.
 *
 * Both surfaces are rendered here against ONE offer, so they cannot drift apart again
 * without this failing.
 */

vi.mock('framer-motion', () => ({
    motion: new Proxy({}, { get: () => (p: any) => React.createElement('div', null, p.children) }),
    AnimatePresence: ({ children }: any) => React.createElement(React.Fragment, null, children),
}));

vi.mock('@/stores/searchStore', () => ({ useUserCurrency: () => 'USD' }));
vi.mock('@/components/common/SaveButton', () => ({ default: () => null }));

import { FlightCard } from '@/components/flights/flightCard';
import { FlightItinerarySummary } from '@/components/flights/FlightItinerarySummary';
import type { FlightOffer, FlightSegmentDetail } from '@/types/flights';

// The real catalogue through next-intl: the card states its stop count with an ICU
// plural, and a hand-rolled interpolator cannot resolve one.
function renderIntl(ui: React.ReactElement) {
    return render(
        <NextIntlClientProvider locale="en" messages={en as never} timeZone="UTC">
            {ui}
        </NextIntlClientProvider>,
    );
}

function seg(sliceIndex: number, from: string, to: string, dep: string, arr: string): FlightSegmentDetail {
    return {
        segmentIndex: sliceIndex,
        airline: { code: 'UA', name: 'United Airlines' },
        origin: from,
        destination: to,
        flightNumber: `UA${from}${to}`,
        departure: { airport: from, time: dep },
        arrival: { airport: to, time: arr },
        duration: 0,
        stops: 0,
        cabinClass: 'economy',
    };
}

// One stop each way. `totalStops` is 2; no flight the traveller boards has 2 stops.
const roundTrip = {
    offerId: 'off_1',
    provider: 'duffel',
    price: { total: 500, base: 400, taxes: 100, currency: 'USD', pricePerAdult: 500 },
    segments: [
        seg(0, 'SFO', 'DEN', '2026-09-12T08:00:00', '2026-09-12T11:30:00'),
        seg(0, 'DEN', 'JFK', '2026-09-12T12:45:00', '2026-09-12T18:40:00'),
        seg(1, 'JFK', 'ORD', '2026-09-16T07:15:00', '2026-09-16T09:05:00'),
        seg(1, 'ORD', 'SFO', '2026-09-16T10:00:00', '2026-09-16T13:20:00'),
    ],
    sliceDurations: [400, 425],
    totalDuration: 825,
    totalStops: 2,
    refundable: false,
    tripType: 'round-trip',
} as FlightOffer;

/**
 * Every "N stop(s)" the given markup puts in front of a traveller, read straight off
 * the rendered text: the stop label sits beside a nested layover span, so scanning by
 * element either skips the label or counts each of its ancestors again.
 */
function stopCounts(container: HTMLElement): number[] {
    const text = container.textContent ?? '';
    // Case-insensitive: the card titles its count ("1 Stop") while the book page's strip
    // writes it in running text ("1 stop(s)"). The number is what has to agree.
    return [...text.matchAll(/(\d+)\s*stop/gi)].map(m => Number(m[1]));
}

describe('stop counts across search and book', () => {
    it('never advertises a stop count no single flight has', () => {
        const card = renderIntl(<FlightCard offer={roundTrip} />);
        const cardCounts = stopCounts(card.container);
        card.unmount();

        const book = renderIntl(<FlightItinerarySummary offer={roundTrip} />);
        const bookCounts = stopCounts(book.container);

        expect(cardCounts.length).toBeGreaterThan(0);
        expect(bookCounts.length).toBeGreaterThan(0);
        // Each leg stops once. 2 is the sum of both legs and describes neither.
        expect(new Set(cardCounts)).toEqual(new Set([1]));
        expect(new Set(bookCounts)).toEqual(new Set([1]));
    });

    it('shows the same outbound stop count on both screens', () => {
        const card = renderIntl(<FlightCard offer={roundTrip} />);
        const fromSearch = stopCounts(card.container)[0];
        card.unmount();

        const book = renderIntl(<FlightItinerarySummary offer={roundTrip} />);
        const fromBook = stopCounts(book.container)[0];

        expect(fromBook).toBe(fromSearch);
    });
});
