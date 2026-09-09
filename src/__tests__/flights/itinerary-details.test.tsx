import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/locales/en.json';

/**
 * Every leg of an offer, drawn in full. The search card shows this when a row is
 * expanded and the book page shows it under the summary strips, so both screens are
 * describing the journey with one component rather than two that can drift.
 */

vi.mock('framer-motion', () => ({
    motion: new Proxy({}, { get: () => (p: any) => React.createElement('div', null, p.children) }),
    AnimatePresence: ({ children }: any) => React.createElement(React.Fragment, null, children),
}));

import { FlightItineraryDetails } from '@/components/flights/FlightItineraryDetails';
import type { FlightOffer, FlightSegmentDetail } from '@/types/flights';

/**
 * Where a piece of text sits in the rendered order. Leaf elements only, so a match is
 * the text itself rather than every ancestor that contains it.
 */
function domOrder(container: HTMLElement, text: string): number {
    return Array.from(container.querySelectorAll('*')).findIndex(
        el => el.children.length === 0 && el.textContent?.trim() === text,
    );
}

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
        flightNumber: `QR${from}${to}`,
        departure: { airport: from, time: departure },
        arrival: { airport: to, time: arrival },
        duration: 0,
        stops: 0,
        cabinClass: 'economy',
        ...overrides,
    };
}

const base = {
    offerId: 'off_1',
    provider: 'duffel',
    price: { total: 1038.7, base: 900, taxes: 138.7, currency: 'USD', pricePerAdult: 1038.7 },
    totalDuration: 1535,
    totalStops: 1,
    refundable: false,
};

const oneWay = {
    ...base,
    segments: [
        seg(0, 'CRK', 'DOH', '2026-09-23T18:40:00', '2026-09-23T22:30:00', { duration: 530, flightNumber: 'QR0927' }),
        seg(0, 'DOH', 'LHR', '2026-09-24T08:00:00', '2026-09-24T13:15:00', { duration: 435, flightNumber: 'QR0003' }),
    ],
    sliceDurations: [1535],
    tripType: 'one-way',
} as FlightOffer;

const roundTrip = {
    ...oneWay,
    segments: [
        ...oneWay.segments,
        seg(1, 'LHR', 'CRK', '2026-09-30T09:00:00', '2026-10-01T06:40:00', { duration: 830, flightNumber: 'QR0500' }),
    ],
    sliceDurations: [1535, 830],
    totalStops: 1,
    tripType: 'round-trip',
} as FlightOffer;

describe('FlightItineraryDetails', () => {
    it('draws every leg of the journey', () => {
        renderIntl(<FlightItineraryDetails offer={roundTrip} />);

        // Three flights out and back: CRK → DOH → LHR, then LHR → CRK. Each airport
        // appears once per time the traveller passes through it.
        expect(screen.getAllByText('Clark International Airport (CRK)')).toHaveLength(2);
        expect(screen.getAllByText('Hamad International Airport (DOH)')).toHaveLength(2);
        // Heathrow: arrived at on the way out, departed from on the way back — the return
        // leg, which the book page never showed at all.
        expect(screen.getAllByText('Heathrow Airport (LHR)')).toHaveLength(2);
    });

    it('shows one layover across the whole itinerary, not one per direction', () => {
        const bothWaysConnect = {
            ...base,
            segments: [
                seg(0, 'CRK', 'DOH', '2026-09-23T18:40:00', '2026-09-23T22:30:00', { duration: 530 }),
                seg(0, 'DOH', 'LHR', '2026-09-24T01:15:00', '2026-09-24T06:30:00', { duration: 470 }),
                seg(1, 'LHR', 'DOH', '2026-09-30T09:00:00', '2026-09-30T18:30:00', { duration: 390 }),
                seg(1, 'DOH', 'CRK', '2026-09-30T21:00:00', '2026-10-01T09:40:00', { duration: 520 }),
            ],
            sliceDurations: [1550, 1480],
            tripType: 'round-trip',
        } as FlightOffer;

        renderIntl(<FlightItineraryDetails offer={bothWaysConnect} />);

        expect(screen.getAllByText('Layover')).toHaveLength(1);
    });

    it('keeps the layover it shows on the leg that leads the card', () => {
        const bothWaysConnect = {
            ...base,
            segments: [
                seg(0, 'CRK', 'DOH', '2026-09-23T18:40:00', '2026-09-23T22:30:00', { duration: 530 }),
                seg(0, 'DOH', 'LHR', '2026-09-24T01:15:00', '2026-09-24T06:30:00', { duration: 470 }),
                seg(1, 'LHR', 'DOH', '2026-09-30T09:00:00', '2026-09-30T18:30:00', { duration: 390 }),
                seg(1, 'DOH', 'CRK', '2026-09-30T21:00:00', '2026-10-01T09:40:00', { duration: 520 }),
            ],
            sliceDurations: [1550, 1480],
            tripType: 'round-trip',
        } as FlightOffer;

        renderIntl(<FlightItineraryDetails offer={bothWaysConnect} />);

        // The outbound waits 2h 45m at Doha; the return waits 2h 30m at the same airport.
        // The one on show is the outbound's.
        expect(screen.getByText('02h 45m at Hamad International Airport')).toBeTruthy();
        expect(screen.queryByText('02h 30m at Hamad International Airport')).toBeNull();
    });

    it('sets the layover between the outbound and the return', () => {
        const bothWaysConnect = {
            ...base,
            segments: [
                seg(0, 'CRK', 'DOH', '2026-09-23T18:40:00', '2026-09-23T22:30:00', { duration: 530 }),
                seg(0, 'DOH', 'LHR', '2026-09-24T01:15:00', '2026-09-24T06:30:00', { duration: 470 }),
                seg(1, 'LHR', 'DOH', '2026-09-30T09:00:00', '2026-09-30T18:30:00', { duration: 390 }),
                seg(1, 'DOH', 'CRK', '2026-09-30T21:00:00', '2026-10-01T09:40:00', { duration: 520 }),
            ],
            sliceDurations: [1550, 1480],
            tripType: 'round-trip',
        } as FlightOffer;

        const { container } = renderIntl(<FlightItineraryDetails offer={bothWaysConnect} />);

        // It reads as a break in the journey: the outbound finishes, then the layover,
        // then the return begins.
        const outboundEnds = domOrder(container, 'Heathrow Airport (LHR)');
        const layover = domOrder(container, 'Layover');
        const returnBegins = domOrder(container, 'Return');

        expect(outboundEnds).toBeGreaterThan(-1);
        expect(layover).toBeGreaterThan(outboundEnds);
        expect(returnBegins).toBeGreaterThan(layover);
    });

    it('names the two directions of a round trip', () => {
        renderIntl(<FlightItineraryDetails offer={roundTrip} />);

        expect(screen.getByText('Outbound')).toBeTruthy();
        expect(screen.getByText('Return')).toBeTruthy();
    });

    it('leaves a one-way journey unlabelled', () => {
        renderIntl(<FlightItineraryDetails offer={oneWay} />);

        // "Outbound" only means something beside a return.
        expect(screen.queryByText('Outbound')).toBeNull();
        expect(screen.queryByText('Return')).toBeNull();
        expect(screen.getByText('Clark International Airport (CRK)')).toBeTruthy();
    });

    it('numbers the legs of a multi-city trip, which has no outbound or return', () => {
        const multiCity = {
            ...base,
            segments: [
                seg(0, 'CRK', 'DOH', '2026-09-23T18:40:00', '2026-09-23T22:30:00', { duration: 530 }),
                seg(1, 'DOH', 'LHR', '2026-09-26T08:00:00', '2026-09-26T13:15:00', { duration: 435 }),
                seg(2, 'LHR', 'CRK', '2026-09-30T09:00:00', '2026-10-01T06:40:00', { duration: 830 }),
            ],
            sliceDurations: [530, 435, 830],
            tripType: 'multi-city',
        } as FlightOffer;

        renderIntl(<FlightItineraryDetails offer={multiCity} />);

        expect(screen.getByText('Leg 1')).toBeTruthy();
        expect(screen.getByText('Leg 2')).toBeTruthy();
        expect(screen.getByText('Leg 3')).toBeTruthy();
        expect(screen.queryByText('Outbound')).toBeNull();
    });
});
