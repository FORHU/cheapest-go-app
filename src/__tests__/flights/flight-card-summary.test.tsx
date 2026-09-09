import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/locales/en.json';

/**
 * The card as the design draws it:
 *
 *   the airline and its flight numbers top left, the fare's badges alongside them;
 *   below, the departure clock over "Departing" and the airport in full, a centred
 *   rule carrying the total duration above and the stop count below, and the arrival
 *   clock over "Arriving at" and its airport;
 *   the fare in a rail down the right, stated to the cent, over a Select button.
 */

vi.mock('framer-motion', () => ({
    motion: new Proxy({}, { get: () => (p: any) => React.createElement('div', null, p.children) }),
    AnimatePresence: ({ children }: any) => React.createElement(React.Fragment, null, children),
}));
vi.mock('@/stores/searchStore', () => ({ useUserCurrency: () => 'USD' }));
vi.mock('@/components/common/SaveButton', () => ({ default: () => null }));

import { FlightCard } from '@/components/flights/flightCard';
import type { FlightOffer, FlightSegmentDetail } from '@/types/flights';

function renderIntl(ui: React.ReactElement) {
    return render(
        <NextIntlClientProvider locale="en" messages={en as never} timeZone="UTC">
            {ui}
        </NextIntlClientProvider>,
    );
}

function seg(
    sliceIndex: number,
    from: string,
    to: string,
    departure: string,
    arrival: string,
    overrides: Partial<FlightSegmentDetail> = {},
): FlightSegmentDetail {
    return {
        segmentIndex: sliceIndex,
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

// CRK → DOH → LHR: one stop, 2h 45m on the ground, 25h 50m gate to gate.
const referenceOffer = {
    offerId: 'off_1',
    provider: 'duffel',
    price: { total: 1038.7, base: 900, taxes: 138.7, currency: 'USD', pricePerAdult: 1039 },
    segments: [
        seg(0, 'CRK', 'DOH', '2026-09-23T18:40:00', '2026-09-23T22:30:00', {
            duration: 530,
            flightNumber: 'QR0927',
            aircraft: 'Boeing 787-8',
        }),
        seg(0, 'DOH', 'LHR', '2026-09-24T01:15:00', '2026-09-24T06:30:00', {
            duration: 470,
            flightNumber: 'QR0003',
            aircraft: 'Airbus A380-800',
        }),
    ],
    sliceDurations: [1550],
    totalDuration: 1550,
    totalStops: 1,
    refundable: false,
    baggage: { carryOnBags: 1, checkedBags: 1 },
    tripType: 'one-way',
} as FlightOffer;

describe('FlightCard — the airline block', () => {
    it('names the airline over every flight number on the leg', () => {
        renderIntl(<FlightCard offer={referenceOffer} />);

        expect(screen.getByText('Qatar Airways')).toBeTruthy();
        // The traveller boards both of these.
        expect(screen.getByText('QR0927, QR0003')).toBeTruthy();
    });

    it('sets the fare badges alongside the airline', () => {
        renderIntl(<FlightCard offer={referenceOffer} />);

        expect(screen.getByText('1 carry-on bag')).toBeTruthy();
        expect(screen.getByText('1 checked bag')).toBeTruthy();
        expect(screen.getByText('Economy')).toBeTruthy();
    });

    it('gives every badge but the cabin a glyph, as the design draws them', () => {
        renderIntl(<FlightCard offer={referenceOffer} />);

        expect(screen.getByText('1 carry-on bag').querySelector('svg')).toBeTruthy();
        expect(screen.getByText('1 checked bag').querySelector('svg')).toBeTruthy();
        expect(screen.getByText('Non-refundable after 24 hours').querySelector('svg')).toBeTruthy();
        // The cabin badge is the one that carries text alone.
        expect(screen.getByText('Economy').querySelector('svg')).toBeNull();
    });

    it('words the refund policy the way the design words it', () => {
        renderIntl(<FlightCard offer={referenceOffer} />);

        expect(screen.getByText('Non-refundable after 24 hours')).toBeTruthy();
    });

    it('leaves the aircraft out of the badge row', () => {
        renderIntl(<FlightCard offer={referenceOffer} />);

        // The design's badges are bags, refundability and cabin — nothing else.
        expect(screen.queryByText('Boeing 787-8')).toBeNull();
    });
});

describe('FlightCard — the route summary', () => {
    it('marks the arrival clock with the day it lands on', () => {
        renderIntl(<FlightCard offer={referenceOffer} />);

        // The duration used to carry this alone, as "1d 01h 50m". It is a proxy, and a
        // lossy one: "1d" appears once ELAPSED time passes 24h, which is a different
        // question from whether the flight crosses midnight. A 90-minute Manila red-eye
        // lands the next day and reads "01h 30m". The clock states it directly now.
        expect(screen.getByText('+1')).toBeTruthy();
    });
});

describe('FlightCard — the route summary', () => {
    it('labels each clock with what it is', () => {
        renderIntl(<FlightCard offer={referenceOffer} />);

        expect(screen.getByText('6:40 PM')).toBeTruthy();
        expect(screen.getByText('Departing')).toBeTruthy();
        expect(screen.getByText('6:30 AM')).toBeTruthy();
        expect(screen.getByText('Arriving at')).toBeTruthy();
    });

    it('names both airports in full rather than by code alone', () => {
        renderIntl(<FlightCard offer={referenceOffer} />);

        expect(screen.getByText('Clark International Airport (CRK)')).toBeTruthy();
        expect(screen.getByText('Heathrow Airport (LHR)')).toBeTruthy();
    });

    it('states the total duration in days and hours above the rule', () => {
        const { container } = renderIntl(<FlightCard offer={referenceOffer} />);

        // 25h 50m gate to gate — "25h 50m" leaves the reader to work out the day change.
        expect(screen.getByText('Total Flight Duration')).toBeTruthy();
        expect(container.textContent).toContain('Total Flight Duration1d 01h 50m');
    });

    it('states the stop count below the rule', () => {
        const { container } = renderIntl(<FlightCard offer={referenceOffer} />);

        expect(container.textContent).toContain('Stops:1 Stop');
    });

    it('counts only the outbound leg of a round trip', () => {
        const roundTrip = {
            ...referenceOffer,
            segments: [
                ...referenceOffer.segments,
                seg(1, 'LHR', 'DOH', '2026-09-30T09:00:00', '2026-09-30T18:30:00', { duration: 390, flightNumber: 'QR0004' }),
                seg(1, 'DOH', 'CRK', '2026-09-30T21:00:00', '2026-10-01T09:40:00', { duration: 520, flightNumber: 'QR0928' }),
            ],
            sliceDurations: [1550, 1480],
            totalStops: 2,
            tripType: 'round-trip',
        } as FlightOffer;

        const { container } = renderIntl(<FlightCard offer={roundTrip} />);

        // Each direction stops once. The offer's totalStops of 2 belongs to neither.
        expect(container.textContent).toContain('Stops:1 Stop');
        expect(container.textContent).not.toContain('2 Stops');
    });
});

describe('FlightCard — the route summary terminal', () => {
    // CRK (T1) → DOH (T2 in / T3 out) → LHR (T4). The collapsed summary is the
    // journey's two ends; the connection's terminals belong to the expanded view.
    const withTerminals = {
        ...referenceOffer,
        segments: [
            seg(0, 'CRK', 'DOH', '2026-09-23T18:40:00', '2026-09-23T22:30:00', {
                duration: 530,
                flightNumber: 'QR0927',
                departure: { airport: 'CRK', terminal: '1', time: '2026-09-23T18:40:00' },
                arrival: { airport: 'DOH', terminal: '2', time: '2026-09-23T22:30:00' },
            }),
            seg(0, 'DOH', 'LHR', '2026-09-24T01:15:00', '2026-09-24T06:30:00', {
                duration: 470,
                flightNumber: 'QR0003',
                departure: { airport: 'DOH', terminal: '3', time: '2026-09-24T01:15:00' },
                arrival: { airport: 'LHR', terminal: '4', time: '2026-09-24T06:30:00' },
            }),
        ],
    } as FlightOffer;

    it('names the departure and arrival terminal without the row being expanded', () => {
        renderIntl(<FlightCard offer={withTerminals} />);

        // getByText, not getAllByText: the only T1 is Clark's gate, the only T4 is
        // Heathrow's — the summary reaches for the journey's ends, not a leg between.
        expect(screen.getByText('Terminal 1')).toBeTruthy();
        expect(screen.getByText('Terminal 4')).toBeTruthy();
    });

    it('sits each terminal under the airport it belongs to', () => {
        renderIntl(<FlightCard offer={withTerminals} />);

        expect(screen.getByText('Clark International Airport (CRK)').parentElement!.textContent).toContain('Terminal 1');
        expect(screen.getByText('Heathrow Airport (LHR)').parentElement!.textContent).toContain('Terminal 4');
    });

    it('says nothing when the airline named no terminal', () => {
        renderIntl(<FlightCard offer={referenceOffer} />);

        expect(screen.queryByText(/Terminal/)).toBeNull();
    });
});

describe('FlightCard — the fare rail', () => {
    it('states the fare to the cent', () => {
        renderIntl(<FlightCard offer={referenceOffer} />);

        expect(screen.getByText('$1,039.00')).toBeTruthy();
        expect(screen.getByText('fees included')).toBeTruthy();
    });

    it('hands the whole offer back when the traveller selects it', () => {
        const onSelect = vi.fn();
        renderIntl(<FlightCard offer={referenceOffer} onSelect={onSelect} />);

        fireEvent.click(screen.getByRole('button', { name: 'Select' }));

        expect(onSelect).toHaveBeenCalledWith(referenceOffer);
    });
});

describe('FlightCard — the itinerary behind "Show all segments"', () => {
    it('draws every flight of the leg once expanded', () => {
        renderIntl(<FlightCard offer={referenceOffer} />);

        fireEvent.click(screen.getByText('Show all segments'));

        expect(screen.getAllByText('Depart from')).toHaveLength(2);
        expect(screen.getByText('02h 45m at Hamad International Airport')).toBeTruthy();
        expect(screen.getByText('Wed, Sep 23, 2026, 6:40 PM')).toBeTruthy();
    });

    it('spells out the connection terminals that the collapsed summary leaves off', () => {
        // CRK (T1) → DOH (T2 in / T3 out) → LHR (T4). Collapsed, the row names the
        // journey's ends; expanding it adds the terminals changed at Doha.
        const withTerminals = {
            ...referenceOffer,
            segments: [
                seg(0, 'CRK', 'DOH', '2026-09-23T18:40:00', '2026-09-23T22:30:00', {
                    duration: 530,
                    flightNumber: 'QR0927',
                    departure: { airport: 'CRK', terminal: '1', time: '2026-09-23T18:40:00' },
                    arrival: { airport: 'DOH', terminal: '2', time: '2026-09-23T22:30:00' },
                }),
                seg(0, 'DOH', 'LHR', '2026-09-24T01:15:00', '2026-09-24T06:30:00', {
                    duration: 470,
                    flightNumber: 'QR0003',
                    departure: { airport: 'DOH', terminal: '3', time: '2026-09-24T01:15:00' },
                    arrival: { airport: 'LHR', terminal: '4', time: '2026-09-24T06:30:00' },
                }),
            ],
        } as FlightOffer;

        renderIntl(<FlightCard offer={withTerminals} />);

        expect(screen.queryByText('Terminal 2')).toBeNull();
        expect(screen.queryByText('Terminal 3')).toBeNull();

        fireEvent.click(screen.getByText('Show all segments'));

        expect(screen.getByText('Terminal 2')).toBeTruthy();
        expect(screen.getByText('Terminal 3')).toBeTruthy();
    });

    it('labels each direction of a round trip', () => {
        const roundTrip = {
            ...referenceOffer,
            segments: [
                ...referenceOffer.segments,
                seg(1, 'LHR', 'CRK', '2026-09-30T09:00:00', '2026-10-01T06:40:00', { duration: 830, flightNumber: 'QR0500' }),
            ],
            sliceDurations: [1550, 830],
            tripType: 'round-trip',
        } as FlightOffer;

        renderIntl(<FlightCard offer={roundTrip} />);
        fireEvent.click(screen.getByText('Show all segments'));

        expect(screen.getByText('Outbound')).toBeTruthy();
        expect(screen.getByText('Return')).toBeTruthy();
    });
});
