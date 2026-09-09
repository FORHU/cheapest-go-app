import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/locales/en.json';

/**
 * A collapsed summary shows two clocks and no date, so an overnight reads as a flight
 * that lands twelve hours BEFORE it leaves. Duffel's own results answer this with a
 * superscript +1 on the arrival, and `dayOffset` was written for it — it just was not
 * wired to anything.
 *
 * The expanded timeline states both dates in full at either end of each leg, so it
 * needs no badge; these are the two places that have nowhere else to say the day.
 */

vi.mock('framer-motion', () => ({
    motion: new Proxy({}, { get: () => (p: any) => React.createElement('div', null, p.children) }),
    AnimatePresence: ({ children }: any) => React.createElement(React.Fragment, null, children),
}));
vi.mock('@/stores/searchStore', () => ({ useUserCurrency: () => 'USD' }));
vi.mock('@/components/common/SaveButton', () => ({ default: () => null }));

import { FlightCard } from '@/components/flights/flightCard';
import { FlightSliceStrip } from '@/components/flights/FlightSliceStrip';
import { offerSlices } from '@/lib/flights/offer-slices';
import type { FlightOffer, FlightSegmentDetail } from '@/types/flights';

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
        airline: { code: 'QR', name: 'Qatar Airways' },
        origin: from,
        destination: to,
        flightNumber: `QR${from}${to}`,
        departure: { airport: from, time: dep },
        arrival: { airport: to, time: arr },
        duration: 0,
        stops: 0,
        cabinClass: 'economy',
    };
}

function offer(segments: FlightSegmentDetail[], overrides: Partial<FlightOffer> = {}): FlightOffer {
    return {
        offerId: 'off_1',
        provider: 'duffel',
        price: { total: 1372.7, base: 1200, taxes: 172.7, currency: 'USD', pricePerAdult: 1373 },
        segments,
        sliceDurations: [1130],
        totalDuration: 1130,
        totalStops: segments.length - 1,
        refundable: false,
        baggage: { carryOnBags: 1, checkedBags: 1 },
        tripType: 'one-way',
        ...overrides,
    } as FlightOffer;
}

// The flight from the Duffel screenshot: CRK 6:40 PM Sep 23 → LHR 6:30 AM Sep 24.
const overnight = offer([
    seg(0, 'CRK', 'DOH', '2026-09-23T18:40:00', '2026-09-23T22:30:00'),
    seg(0, 'DOH', 'LHR', '2026-09-24T01:15:00', '2026-09-24T06:30:00'),
]);

const sameDay = offer([seg(0, 'CRK', 'MNL', '2026-09-23T08:00:00', '2026-09-23T09:15:00')]);

describe('FlightCard arrival day offset', () => {
    it('marks an arrival that lands the next day', () => {
        renderIntl(<FlightCard offer={overnight} />);
        expect(screen.getByText('+1')).toBeTruthy();
    });

    it('leaves a same-day arrival unmarked', () => {
        renderIntl(<FlightCard offer={sameDay} />);
        expect(screen.queryByText('+1')).toBeNull();
    });

    it('marks a two-night arrival +2', () => {
        renderIntl(
            <FlightCard
                offer={offer([seg(0, 'SYD', 'LHR', '2026-09-23T21:00:00', '2026-09-25T06:00:00')])}
            />,
        );
        expect(screen.getByText('+2')).toBeTruthy();
    });

    it('measures a round trip against its own outbound, not the return', () => {
        // The card shows the OUTBOUND arrival. Measuring to the last segment overall
        // would date the badge from a return leg the traveller takes a week later.
        const roundTrip = offer(
            [
                seg(0, 'CRK', 'LHR', '2026-09-23T08:00:00', '2026-09-23T18:00:00'),
                seg(1, 'LHR', 'CRK', '2026-09-30T20:00:00', '2026-10-01T19:00:00'),
            ],
            { tripType: 'round-trip', sliceDurations: [600, 660] },
        );

        renderIntl(<FlightCard offer={roundTrip} />);
        expect(screen.queryByText('+1')).toBeNull();
    });
});

describe('FlightSliceStrip arrival day offset', () => {
    it('marks a slice that lands the next day', () => {
        renderIntl(<FlightSliceStrip slice={offerSlices(overnight)[0]} />);
        expect(screen.getByText('+1')).toBeTruthy();
    });

    it('leaves a same-day slice unmarked', () => {
        renderIntl(<FlightSliceStrip slice={offerSlices(sameDay)[0]} />);
        expect(screen.queryByText('+1')).toBeNull();
    });
});
