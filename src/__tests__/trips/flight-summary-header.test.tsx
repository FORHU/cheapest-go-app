import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/locales/en.json';

/**
 * The summary a traveller reads about a flight they have already paid for: who is
 * flying it, under which record, from which terminal, and when.
 *
 * One component, drawn the same way on the trips list and on a trip's own page. They
 * each had their own version before — the list card's and an inline one in
 * trips/[id]/page.tsx — and the two had already drifted into different layouts, a
 * different itinerary, and duplicate copies of the leg-grouping rule.
 */

vi.mock('framer-motion', () => ({
    motion: new Proxy({}, { get: () => (p: any) => React.createElement('div', null, p.children) }),
    AnimatePresence: ({ children }: any) => React.createElement(React.Fragment, null, children),
}));

import { FlightSummaryHeader } from '@/components/trips/FlightSummaryHeader';

function renderIntl(ui: React.ReactElement) {
    return render(
        <NextIntlClientProvider locale="en" messages={en as never} timeZone="UTC">
            {ui}
        </NextIntlClientProvider>,
    );
}

/** CRK → DOH → LHR on Qatar Airways. Stored instants: 10:40Z out, 05:30Z in. */
const booking: any = {
    id: 'fb_1',
    pnr: 'CG2MTN',
    provider: 'duffel',
    passengers: [{ id: 'p1', first_name: 'Ana', last_name: 'Reyes', type: 'ADT' }],
    flight_segments: [
        {
            id: 's1', airline: 'QR', flight_number: 'QR0927', origin: 'CRK', destination: 'DOH',
            departure: '2026-09-23T10:40:00.000Z', arrival: '2026-09-23T19:30:00.000Z',
            itinerary_index: 0, segment_index: 0,
            cabin_class: 'economy', origin_terminal: '1', destination_terminal: '1',
        },
        {
            id: 's2', airline: 'QR', flight_number: 'QR0103', origin: 'DOH', destination: 'LHR',
            departure: '2026-09-23T22:15:00.000Z', arrival: '2026-09-24T05:30:00.000Z',
            itinerary_index: 0, segment_index: 0,
            cabin_class: 'economy', origin_terminal: '1', destination_terminal: '2',
        },
    ],
};

describe('FlightSummaryHeader', () => {
    it('names the airline and every flight number the traveller boards', () => {
        renderIntl(<FlightSummaryHeader booking={booking} />);

        expect(screen.getByText('Qatar Airways')).toBeTruthy();
        expect(screen.getByText('QR0927, QR0103')).toBeTruthy();
    });

    it('carries the record locator the airline knows the booking by', () => {
        renderIntl(<FlightSummaryHeader booking={booking} />);

        expect(screen.getByText('CG2MTN')).toBeTruthy();
    });

    it('counts a single traveller in the singular', () => {
        renderIntl(<FlightSummaryHeader booking={booking} />);

        expect(screen.getByText('1 passenger')).toBeTruthy();
    });

    it('tells the time on a 12-hour clock, the way the ticket reads', () => {
        const { container } = renderIntl(<FlightSummaryHeader booking={booking} />);
        const text = container.textContent!;

        // Asserted by shape, not by an exact clock: these are instants rendered in the
        // runtime's zone, so the digits differ per machine while the format must not.
        expect(text).toMatch(/\d{1,2}:\d{2}\s?(AM|PM)/);
        // No 24-hour leftovers — "18:40" has no marker after it.
        expect(text).not.toMatch(/\b(1[3-9]|2[0-3]):\d{2}(?!\s?(AM|PM))/);
    });

    it('states the elapsed time across the whole outbound, connection included', () => {
        renderIntl(<FlightSummaryHeader booking={booking} />);

        // 10:40Z to 05:30Z the next day.
        expect(screen.getByText('18h 50m')).toBeTruthy();
    });

    it('leads each end with the code and terminal a traveller walks to', () => {
        renderIntl(<FlightSummaryHeader booking={booking} />);

        expect(screen.getByText('CRK T1')).toBeTruthy();
        expect(screen.getByText('LHR T2')).toBeTruthy();
    });

    it('names each airport in full above its code', () => {
        renderIntl(<FlightSummaryHeader booking={booking} />);

        expect(screen.getByText('Clark International Airport')).toBeTruthy();
        expect(screen.getByText('Heathrow Airport')).toBeTruthy();
    });

    it('says the fare is non-refundable on the same row as the other facts', () => {
        // The design puts refundability beside PNR / passengers / stops, because it is
        // the fact a traveller looking at a booking they may want out of reads first.
        renderIntl(<FlightSummaryHeader booking={{ ...booking, fare_policy: { isRefundable: false } }} />);

        expect(screen.getByText(/non-refundable/i)).toBeTruthy();
    });

    it('says nothing about refundability when the fare rules are not on record', () => {
        // Absent is not the same as non-refundable — claiming the stricter of the two
        // about someone's ticket is the expensive way to be wrong.
        renderIntl(<FlightSummaryHeader booking={{ ...booking, fare_policy: undefined }} />);

        expect(screen.queryByText(/refundable/i)).toBeNull();
    });

    it('draws nothing for a booking whose flights are not on record', () => {
        const { container } = renderIntl(<FlightSummaryHeader booking={{ ...booking, flight_segments: [] }} />);

        expect(container.textContent).toBe('');
    });
});
