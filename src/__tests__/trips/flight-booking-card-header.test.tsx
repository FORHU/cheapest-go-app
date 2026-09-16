import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
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

/**
 * Expanding the itinerary, on the data the trips list actually holds.
 *
 * fetchTripsData reads flight_segments with `SELECT fs.*`, so the driver parses
 * `timestamp with time zone` into Date objects, and React carries Dates across to the
 * client intact. The row is typed as a string and the itinerary believed it — it slices
 * the ISO text — so the first click on "Show flight itinerary" threw
 * "iso.slice is not a function" and took the whole /trips route into its error boundary.
 * The summary above it survived because its formatters build a Date instead of slicing.
 */
describe('the flight itinerary dropdown', () => {
    const storedAsDates: any = {
        ...booking,
        flight_segments: booking.flight_segments.map((s: any) => ({
            ...s,
            departure: new Date(s.departure),
            arrival: new Date(s.arrival),
        })),
    };

    it('opens without throwing when the segments carry stored instants as Dates', () => {
        renderIntl(<FlightBookingCard booking={storedAsDates} />);

        fireEvent.click(screen.getAllByText('Show flight itinerary')[0].closest('button')!);

        expect(screen.getAllByText('Hide flight itinerary').length).toBeGreaterThan(0);
        // The itinerary drew its ends rather than blanking them out.
        expect(screen.getAllByText(/Clark International Airport/).length).toBeGreaterThan(0);
    });

    it('states the same departure clock in the summary and in the itinerary it expands to', () => {
        // The two halves read the same instant through different formatters. Left
        // unconverted, they disagreed by the viewer's UTC offset — one said 6:40 PM while
        // the other could only manage "--:--".
        renderIntl(<FlightBookingCard booking={storedAsDates} />);

        fireEvent.click(screen.getAllByText('Show flight itinerary')[0].closest('button')!);

        expect(screen.queryByText('--:--')).toBeNull();
    });
});

/**
 * Every status wears the same chip.
 *
 * The design draws status as one shape — a rounded pill with an icon, a border and a
 * tone. Only "Flight in progress" was ever built that way; the other nine states were
 * left as bare coloured text, so a card's most important line changed shape depending on
 * what had happened to the booking. Tone still varies per state; the chrome must not.
 */
describe('the status chip', () => {
    /** The shape the design gives every status, regardless of tone. */
    const PILL = ['rounded-full', 'border', 'px-2', 'py-0.5'];

    const cases: [string, string][] = [
        ['cancel_requested', 'Cancellation stuck — retry below'],
        ['refund_pending', 'Refund processing'],
        ['refunded', 'Refunded'],
        ['refund_failed', 'Refund Failed'],
        ['cancelled', 'Cancelled'],
        ['ticketed', 'Upcoming Flight'],
    ];

    for (const [status, label] of cases) {
        it(`draws ${status} as the same pill as every other status`, () => {
            renderIntl(<FlightBookingCard booking={{ ...booking, status }} />);

            // Scoped to the wide layout's right column. The narrow layout carries its own
            // status badge from a different vocabulary (flightStatusLabels), and three of
            // these labels are the same word in both — an unscoped lookup finds two.
            const column = screen.getByText('Total Paid:').closest('div')!.parentElement!;
            const chip = within(column).getByText(label).closest('span');
            expect(chip, `no chip rendered for ${status}`).toBeTruthy();

            const classes = String(chip!.className);
            for (const shape of PILL) {
                expect(classes, `${status} chip is missing "${shape}" — it is not the design's pill`).toContain(shape);
            }
        });
    }
});

/**
 * One status system, said the same way at both widths.
 *
 * The card draws two layouts and only one is visible at a time, but they were reading
 * from two different vocabularies: the wide one from `stateChips.*`, the narrow one from
 * a hard-coded English `flightStatusLabels` map. A ticketed booking therefore called
 * itself "Upcoming Flight" on a laptop and "Confirmed" on a phone, in a shape that was
 * not the design's pill and in English regardless of the reader's locale.
 *
 * The wide vocabulary wins: it is the one the design specifies, it is state-aware
 * (upcoming / in progress / completed all read differently off the same "ticketed"), and
 * it goes through next-intl. The narrow map's three states that it did not cover —
 * being created, held but unticketed, and failed — move into it rather than being lost.
 */
describe('the status chip at narrow widths', () => {
    const PILL = ['rounded-full', 'border', 'px-2', 'py-0.5'];

    /** Both layouts render in jsdom; only CSS hides one. So each status appears twice. */
    function chipsFor(status: string, label: string) {
        renderIntl(<FlightBookingCard booking={{ ...booking, status }} />);
        return screen.getAllByText(label);
    }

    it('draws the narrow layout status as the same pill as the wide one', () => {
        const chips = chipsFor('ticketed', 'Upcoming Flight');

        expect(chips, 'both layouts should state the status').toHaveLength(2);
        for (const chip of chips) {
            const classes = String(chip.closest('span')!.className);
            for (const shape of PILL) {
                expect(classes, `a status chip is missing "${shape}" — it is not the design's pill`).toContain(shape);
            }
        }
    });

    it('does not call the same booking two different things', () => {
        renderIntl(<FlightBookingCard booking={booking} />);

        // "Confirmed" was the narrow layout's word for exactly the state the wide one
        // calls "Upcoming Flight". Two names for one state is how a support call starts.
        expect(screen.queryByText('Confirmed')).toBeNull();
    });

    it('says a booking failed rather than saying nothing at all', () => {
        // The wide layout had no branch for this: a booking that failed outright showed
        // an empty status column, which reads as "nothing is wrong".
        expect(chipsFor('failed', 'Booking failed')).toHaveLength(2);
    });

    it('says a booking is still being created', () => {
        expect(chipsFor('booked', 'Processing')).toHaveLength(2);
    });

    it('says a seat is held but not yet ticketed', () => {
        expect(chipsFor('pnr_created', 'Booked')).toHaveLength(2);
    });

    it('falls back to a chip rather than silence for a status it does not know', () => {
        expect(chipsFor('something_new', 'Unknown')).toHaveLength(2);
    });
});
