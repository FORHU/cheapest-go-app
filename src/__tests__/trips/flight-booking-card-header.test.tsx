import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/locales/en.json';

/**
 * The Trips flight card's summary header, drawn as the design draws it.
 *
 * This component had no test at all before this file: the cancel, void, refund and
 * reissue flows, and the header itself, were all unguarded. These cover the header —
 * what the traveller reads at a glance about a flight they have already paid for.
 */

vi.mock('@/stores/searchStore', () => ({ useUserCurrency: () => 'USD' }));

vi.mock('framer-motion', () => ({
    motion: new Proxy({}, { get: () => (p: any) => React.createElement('div', null, p.children) }),
    AnimatePresence: ({ children }: any) => React.createElement(React.Fragment, null, children),
}));

import FlightBookingCard from '@/components/trips/FlightBookingCard';

function renderIntl(ui: React.ReactElement) {
    return render(
        <NextIntlClientProvider locale="en" messages={en as never} timeZone="UTC">
            {ui}
        </NextIntlClientProvider>,
    );
}

/**
 * CRK → DOH → LHR on Qatar Airways, one stop at Doha.
 *
 * Times are absolute instants, which is what `timestamp with time zone` gives back —
 * CRK 18:40 +08:00 is 10:40 UTC, DOH 22:30 +03:00 is 19:30 UTC, so that flight runs
 * 8h 50m. The whole outbound, Clark to Heathrow, runs 18h 50m.
 */
const booking: any = {
    id: 'fb_1',
    user_id: 'u_1',
    pnr: 'CG2MTN',
    provider: 'duffel',
    total_price: 354,
    charged_price: 354,
    currency: 'USD',
    status: 'ticketed',
    trip_type: 'one-way',
    created_at: '2026-09-01T00:00:00.000Z',
    passengers: [{ id: 'p1', booking_id: 'fb_1', first_name: 'Ana', last_name: 'Reyes', type: 'ADT' }],
    flight_segments: [
        {
            id: 's1', booking_id: 'fb_1', airline: 'QR', flight_number: 'QR0927',
            origin: 'CRK', destination: 'DOH',
            departure: '2026-09-23T10:40:00.000Z', // 18:40 at Clark (+08:00)
            arrival: '2026-09-23T19:30:00.000Z',   // 22:30 at Doha  (+03:00)
            itinerary_index: 0, segment_index: 0,
            cabin_class: 'economy', origin_terminal: '1', destination_terminal: '1',
        },
        {
            id: 's2', booking_id: 'fb_1', airline: 'QR', flight_number: 'QR0103',
            origin: 'DOH', destination: 'LHR',
            departure: '2026-09-23T22:15:00.000Z', // 01:15 next day at Doha
            arrival: '2026-09-24T05:30:00.000Z',   // 06:30 at Heathrow (+01:00)
            itinerary_index: 0, segment_index: 0,
            cabin_class: 'economy', origin_terminal: '1', destination_terminal: '2',
        },
    ],
};

describe('FlightBookingCard header', () => {
    it('names the airline and every flight number the traveller boards', () => {
        renderIntl(<FlightBookingCard booking={booking} />);

        expect(screen.getAllByText('Qatar Airways').length).toBeGreaterThan(0);
        expect(screen.getByText('QR0927, QR0103')).toBeTruthy();
    });

    it('states the total flight duration between the two clocks', () => {
        renderIntl(<FlightBookingCard booking={booking} />);

        // Clark 10:40 UTC to Heathrow 05:30 UTC the next day.
        expect(screen.getAllByText(/Total Flight Duration/i).length).toBeGreaterThan(0);
        expect(screen.getAllByText('18h 50m').length).toBeGreaterThan(0);
    });

    it('leads each end with its airport code and terminal', () => {
        renderIntl(<FlightBookingCard booking={booking} />);

        expect(screen.getAllByText('CRK T1').length).toBeGreaterThan(0);
        expect(screen.getAllByText('LHR T2').length).toBeGreaterThan(0);
    });

    it('tells the same time twice, not two different ones for the same flight', () => {
        // The card states the departure clock in two places. They were rendered by two
        // different formatters that disagreed about what the stored timestamp means —
        // one read it as an instant, the other as wall-clock digits — so the same flight
        // advertised 18:40 in one row and 10:40 in the next.
        const { container } = renderIntl(<FlightBookingCard booking={booking} />);
        const text = container.textContent!.replace(/\s+/g, ' ');

        // Guard against a vacuous pass: if nothing rendered, there are no clocks to
        // disagree and this would "pass" while proving nothing.
        expect(text).toContain('CG2MTN');

        // This booking has one departure and one arrival, so whatever clock the card
        // chooses to render them in, there are two distinct times on it — not four.
        // No word boundaries: textContent runs adjacent nodes together ("13:30CG2MTN"),
        // so \b would silently match nothing and the assertion would pass on an empty set.
        const clocks = new Set([...text.matchAll(/(\d{1,2}):(\d{2})/g)].map(m => `${m[1]}:${m[2]}`));
        expect(
            [...clocks].sort(),
            `the card shows these clock values for one departure and one arrival`,
        ).toHaveLength(2);
    });

    it('counts a single traveller in the singular', () => {
        renderIntl(<FlightBookingCard booking={booking} />);

        expect(screen.getAllByText('1 passenger').length).toBeGreaterThan(0);
        expect(screen.queryByText('1 passengers')).toBeNull();
    });

    it('does not repeat the route as a heading above the ends that already name it', () => {
        // The design leads with the airline and the two ends; "One-way / CRK to LHR"
        // restates what DEPART FROM and ARRIVE AT say underneath it, so the wide layout
        // drops it. The narrow one keeps it: at that width the ends are the only thing
        // on the card, and a route line is how it says where the trip goes at all.
        // So the route survives once, not twice.
        renderIntl(<FlightBookingCard booking={booking} />);

        expect(screen.getAllByText('CRK to LHR')).toHaveLength(1);
        expect(screen.getAllByText('One-way')).toHaveLength(1);
    });
});
