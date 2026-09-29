import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/locales/en.json';

/**
 * A leg drawn as the design draws it: each flight is three columns — the departure
 * clock over the airport it leaves and DEPART FROM with its date, terminal, flight and
 * aircraft; the elapsed time over a dotted rule; and the arrival clock over the airport
 * it reaches and ARRIVE AT with the same facts. Between two flights sits the layover.
 *
 * Rendered against the real message catalogue so the copy is exercised, not stood in for.
 */

vi.mock('framer-motion', () => ({
    motion: new Proxy({}, { get: () => (p: any) => React.createElement('div', null, p.children) }),
    AnimatePresence: ({ children }: any) => React.createElement(React.Fragment, null, children),
}));

import { FlightItineraryTimeline } from '@/components/flights/FlightItineraryTimeline';
import { offerSlices } from '@/lib/flights/offer-slices';
import type { FlightOffer, FlightSegmentDetail } from '@/types/flights';

function renderIntl(ui: React.ReactElement) {
    return render(
        <NextIntlClientProvider locale="en" messages={en as never} timeZone="UTC">
            {ui}
        </NextIntlClientProvider>,
    );
}

function seg(
    from: string,
    to: string,
    departure: string,
    arrival: string,
    overrides: Partial<FlightSegmentDetail> = {},
): FlightSegmentDetail {
    return {
        segmentIndex: 0,
        airline: { code: 'QR', name: 'Qatar Airways' },
        origin: from,
        destination: to,
        flightNumber: `QR${from}`,
        departure: { airport: from, time: departure },
        arrival: { airport: to, time: arrival },
        duration: 0,
        stops: 0,
        cabinClass: 'economy',
        ...overrides,
    };
}

// CRK → DOH → LHR, with 2h 45m on the ground at Doha.
const oneStop = {
    offerId: 'off_1',
    provider: 'duffel',
    price: { total: 1038.7, base: 900, taxes: 138.7, currency: 'USD', pricePerAdult: 1038.7 },
    segments: [
        seg('CRK', 'DOH', '2026-09-23T18:40:00', '2026-09-23T22:30:00', {
            duration: 530,
            flightNumber: 'QR0927',
            aircraft: 'Boeing 787-8',
        }),
        seg('DOH', 'LHR', '2026-09-24T01:15:00', '2026-09-24T06:30:00', {
            duration: 470,
            flightNumber: 'QR0003',
            aircraft: 'Airbus A380-800',
        }),
    ],
    sliceDurations: [1550],
    totalDuration: 1550,
    totalStops: 1,
    refundable: false,
} as FlightOffer;

describe('FlightItineraryTimeline', () => {
    it('puts the clock of each end above the airport it belongs to', () => {
        renderIntl(<FlightItineraryTimeline slice={offerSlices(oneStop)[0]} />);

        expect(screen.getByText('6:40 PM')).toBeTruthy();
        expect(screen.getByText('10:30 PM')).toBeTruthy();
        expect(screen.getByText('1:15 AM')).toBeTruthy();
        expect(screen.getByText('6:30 AM')).toBeTruthy();
    });

    it('labels which end is which', () => {
        renderIntl(<FlightItineraryTimeline slice={offerSlices(oneStop)[0]} />);

        expect(screen.getAllByText('Depart from')).toHaveLength(2);
        expect(screen.getAllByText('Arrive at')).toHaveLength(2);
    });

    it('names the airport in full beneath each end', () => {
        renderIntl(<FlightItineraryTimeline slice={offerSlices(oneStop)[0]} />);

        expect(screen.getByText('Clark International Airport (CRK)')).toBeTruthy();
        expect(screen.getAllByText('Hamad International Airport (DOH)')).toHaveLength(2);
        expect(screen.getByText('Heathrow Airport (LHR)')).toBeTruthy();
    });

    it("carries each flight's own elapsed time over the rule", () => {
        const { container } = renderIntl(<FlightItineraryTimeline slice={offerSlices(oneStop)[0]} />);

        expect(container.textContent).toContain('Flight Duration08h 50m');
        expect(container.textContent).toContain('Flight Duration07h 50m');
        // 1550 is the whole leg including the wait; it describes neither flight.
        expect(screen.queryByText(/1d 01h 50m/)).toBeNull();
    });

    it('dates both ends of the rule, so an overnight flight says which day it lands', () => {
        renderIntl(<FlightItineraryTimeline slice={offerSlices(oneStop)[0]} />);

        expect(screen.getByText('Wed, Sep 23, 2026, 6:40 PM')).toBeTruthy();
        expect(screen.getByText('Wed, Sep 23, 2026, 10:30 PM')).toBeTruthy();
        // The second flight leaves after midnight — a different date entirely.
        expect(screen.getByText('Thu, Sep 24, 2026, 1:15 AM')).toBeTruthy();
        expect(screen.getByText('Thu, Sep 24, 2026, 6:30 AM')).toBeTruthy();
    });

    it('sets the layover between the two flights and names where it happens', () => {
        renderIntl(<FlightItineraryTimeline slice={offerSlices(oneStop)[0]} />);

        expect(screen.getByText('Layover')).toBeTruthy();
        expect(screen.getByText('02h 45m at Hamad International Airport')).toBeTruthy();
    });

    it('gives a nonstop leg no layover at all', () => {
        const nonstop = {
            ...oneStop,
            segments: [seg('CRK', 'LHR', '2026-09-23T18:40:00', '2026-09-24T06:30:00', { duration: 710, flightNumber: 'QR0100' })],
            sliceDurations: [710],
        } as FlightOffer;

        renderIntl(<FlightItineraryTimeline slice={offerSlices(nonstop)[0]} />);

        expect(screen.queryByText('Layover')).toBeNull();
        expect(screen.getByText('Clark International Airport (CRK)')).toBeTruthy();
        expect(screen.getByText('Heathrow Airport (LHR)')).toBeTruthy();
    });

    it('names each end by its airport alone, with no separate city line', () => {
        renderIntl(<FlightItineraryTimeline slice={offerSlices(oneStop)[0]} />);

        // The airport's own name already says where it is; the design gives the city no line.
        expect(screen.queryByText('Clark')).toBeNull();
        expect(screen.queryByText('Doha')).toBeNull();
        expect(screen.getByText('Clark International Airport (CRK)')).toBeTruthy();
    });

    it('marks an arrival that lands on a later day beside its clock', () => {
        renderIntl(<FlightItineraryTimeline slice={offerSlices(oneStop)[0]} />);

        // CRK 18:40 → DOH 22:30 lands the same day; DOH 01:15 → LHR 06:30 does too.
        expect(screen.queryByText(/\+ \d/)).toBeNull();

        const overnight = {
            ...oneStop,
            segments: [seg('CRK', 'LHR', '2026-09-23T18:40:00', '2026-09-24T06:30:00', { duration: 1070 })],
            sliceDurations: [1070],
        } as FlightOffer;
        const { container } = renderIntl(<FlightItineraryTimeline slice={offerSlices(overnight)[0]} />);
        expect(container.textContent).toContain('6:30 AM + 1');
    });

    it('names the cabin and flight number at both ends of a flight', () => {
        renderIntl(<FlightItineraryTimeline slice={offerSlices(oneStop)[0]} />);

        // Same flight, so the same identity reads at either end without looking across the row.
        expect(screen.getAllByText('Economy QR0927')).toHaveLength(2);
        expect(screen.getAllByText('Economy QR0003')).toHaveLength(2);
    });

    it('names the aircraft at both ends of a flight, when the provider gave one', () => {
        renderIntl(<FlightItineraryTimeline slice={offerSlices(oneStop)[0]} />);

        expect(screen.getAllByText('Boeing 787-8')).toHaveLength(2);
        expect(screen.getAllByText('Airbus A380-800')).toHaveLength(2);
    });

    it('names no aircraft when the provider gave none, rather than leaving a blank bullet', () => {
        const noAircraft = {
            ...oneStop,
            segments: [seg('CRK', 'LHR', '2026-09-23T18:40:00', '2026-09-24T06:30:00', { duration: 710, flightNumber: 'QR0100' })],
            sliceDurations: [710],
        } as FlightOffer;

        const { container } = renderIntl(<FlightItineraryTimeline slice={offerSlices(noAircraft)[0]} />);

        expect(screen.getAllByText('Economy QR0100')).toHaveLength(2);
        // No trailing "• " with nothing after it.
        expect(container.textContent).not.toMatch(/•\s*•/);
    });

    it('falls back to the bare code for an airport it does not know', () => {
        const unknown = {
            ...oneStop,
            segments: [seg('ZZZ', 'CRK', '2026-09-23T08:00:00', '2026-09-23T10:00:00', { duration: 120 })],
            sliceDurations: [120],
        } as FlightOffer;

        renderIntl(<FlightItineraryTimeline slice={offerSlices(unknown)[0]} />);

        expect(screen.getByText('ZZZ')).toBeTruthy();
    });
});

describe('FlightItineraryTimeline — the design pass', () => {
    it('draws no plane glyphs beside the clocks', () => {
        const { container } = renderIntl(<FlightItineraryTimeline slice={offerSlices(oneStop)[0]} />);

        expect(container.querySelector('img[src*="flight-takeoff"], img[src*="flight-land"]')).toBeNull();
    });

    it('hangs a dot to the right of every ARRIVE AT fact', () => {
        renderIntl(<FlightItineraryTimeline slice={offerSlices(oneStop)[0]} />);

        // The first flight's arrival end, at Doha.
        for (const fact of ['Wed, Sep 23, 2026, 10:30 PM', 'Boeing 787-8']) {
            const arrivalFacts = screen.getAllByText(fact).map(el => el.closest('li')!);
            const li = arrivalFacts[arrivalFacts.length - 1];
            const dot = li.querySelector('[data-fact-dot]');
            expect(dot).not.toBeNull();
            // After the words, so it sits on their right.
            expect(li.lastElementChild).toBe(dot);
            expect(dot).toHaveAttribute('aria-hidden', 'true');
        }
    });

    it('leaves the dot out of the fact text a reader or search finds', () => {
        renderIntl(<FlightItineraryTimeline slice={offerSlices(oneStop)[0]} />);

        expect(screen.getAllByText('Economy QR0927')).toHaveLength(2);
    });

    it('keeps DEPART FROM facts on their left-hand bullets', () => {
        renderIntl(<FlightItineraryTimeline slice={offerSlices(oneStop)[0]} />);

        const departure = screen.getByText('Wed, Sep 23, 2026, 6:40 PM').closest('li')!;
        expect(departure.querySelector('[data-fact-dot]')).toBeNull();
        expect(departure.parentElement).toHaveClass('list-disc');
    });

    it('sets the layover label as a pill that stands out from the muted labels', () => {
        renderIntl(<FlightItineraryTimeline slice={offerSlices(oneStop)[0]} />);

        const label = screen.getByText('Layover');
        expect(label).toHaveClass('font-semibold', 'rounded-full');
        expect(label.className).toMatch(/\bbg-(?!transparent)/);
        expect(label.className).not.toContain('text-[#939fb1]');
    });
});

describe('FlightItineraryTimeline — terminals', () => {
    // CRK → DOH → LHR, every end terminal-tagged: T1 out of Clark, T1 both sides at
    // Doha, T4 into Heathrow.
    const withTerminals = {
        ...oneStop,
        segments: [
            seg('CRK', 'DOH', '2026-09-23T18:40:00', '2026-09-23T22:30:00', {
                duration: 530,
                flightNumber: 'QR0927',
                departure: { airport: 'CRK', terminal: '1', time: '2026-09-23T18:40:00' },
                arrival: { airport: 'DOH', terminal: '1', time: '2026-09-23T22:30:00' },
            }),
            seg('DOH', 'LHR', '2026-09-24T01:15:00', '2026-09-24T06:30:00', {
                duration: 470,
                flightNumber: 'QR0003',
                departure: { airport: 'DOH', terminal: '1', time: '2026-09-24T01:15:00' },
                arrival: { airport: 'LHR', terminal: '4', time: '2026-09-24T06:30:00' },
            }),
        ],
    } as FlightOffer;

    it('names the terminal beneath each end that has one', () => {
        renderIntl(<FlightItineraryTimeline slice={offerSlices(withTerminals)[0]} />);

        // CRK depart, DOH arrive, DOH depart — three ends at Terminal 1.
        expect(screen.getAllByText('Terminal 1')).toHaveLength(3);
        expect(screen.getByText('Terminal 4')).toBeTruthy();
    });

    it('sits the terminal with the airport it belongs to, not loose in the row', () => {
        renderIntl(<FlightItineraryTimeline slice={offerSlices(withTerminals)[0]} />);

        // The arrival end of the first flight: Heathrow and its terminal share a column.
        // Asserted as "same column", not as a count of parentElements — the bullet lines
        // nest their own rows, and how deeply is a layout detail this should survive. The
        // end column is the nearest div; everything inside a bullet line is a span.
        const heathrow = screen.getByText('Heathrow Airport (LHR)');
        const terminal = screen.getByText('Terminal 4');
        const column = heathrow.closest('div');

        // Guard against a vacuous pass: two nulls would satisfy the comparison below.
        expect(column).toBeTruthy();
        expect(column).toBe(terminal.closest('div'));
    });

    it('says terminal info comes closer to departure at an untracked airport with none stated', () => {
        renderIntl(<FlightItineraryTimeline slice={offerSlices(oneStop)[0]} />);

        // CRK depart and LHR arrive: neither is tracked, so both get the note.
        // DOH arrive and DOH depart resolve via the single-terminal default
        // instead (Hamad Intl has exactly one terminal) — see the next test.
        expect(screen.getAllByText('Terminal available closer to departure')).toHaveLength(2);
        expect(screen.getAllByText('Terminal 1')).toHaveLength(2);
    });

    it('fills a missing terminal from the standing assignment for the operating carrier', () => {
        // Korean Air ICN→MNL: Duffel gives no terminal, but ICN T2 is where KE flies from.
        const koreanAir = {
            ...oneStop,
            segments: [
                seg('ICN', 'MNL', '2026-09-23T20:00:00', '2026-09-24T00:00:00', {
                    duration: 240,
                    flightNumber: 'KE621',
                    airline: { code: 'KE', name: 'Korean Air' },
                }),
            ],
            sliceDurations: [240],
        } as FlightOffer;

        renderIntl(<FlightItineraryTimeline slice={offerSlices(koreanAir)[0]} />);

        expect(screen.getByText('Terminal 2')).toBeTruthy();
    });

    it('shows a terminal change across a layover — land at one, leave from another', () => {
        const terminalChange = {
            ...oneStop,
            segments: [
                seg('CRK', 'DOH', '2026-09-23T18:40:00', '2026-09-23T22:30:00', {
                    duration: 530,
                    flightNumber: 'QR0927',
                    departure: { airport: 'CRK', time: '2026-09-23T18:40:00' },
                    arrival: { airport: 'DOH', terminal: '1', time: '2026-09-23T22:30:00' },
                }),
                seg('DOH', 'LHR', '2026-09-24T01:15:00', '2026-09-24T06:30:00', {
                    duration: 470,
                    flightNumber: 'QR0003',
                    departure: { airport: 'DOH', terminal: '2', time: '2026-09-24T01:15:00' },
                    arrival: { airport: 'LHR', time: '2026-09-24T06:30:00' },
                }),
            ],
        } as FlightOffer;

        renderIntl(<FlightItineraryTimeline slice={offerSlices(terminalChange)[0]} />);

        expect(screen.getByText('Terminal 1')).toBeTruthy();
        expect(screen.getByText('Terminal 2')).toBeTruthy();
    });
});
