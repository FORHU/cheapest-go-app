import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import en from '@/locales/en.json';

vi.mock('next-intl', () => ({
    useTranslations: (namespace: string) => (key: string, values?: Record<string, unknown>) => {
        const path = `${namespace}.${key}`.split('.');
        let node: any = en;
        for (const part of path) node = node?.[part];
        if (typeof node !== 'string') return path.join('.');
        return node.replace(/\{(\w+)\}/g, (_, name) => String(values?.[name] ?? ''));
    },
    useLocale: () => 'en',
}));

import { FlightItinerarySummary } from '@/components/flights/FlightItinerarySummary';
import type { FlightOffer, FlightSegmentDetail } from '@/types/flights';

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

const base = {
    offerId: 'off_1',
    provider: 'duffel',
    price: { total: 500, base: 400, taxes: 100, currency: 'USD', pricePerAdult: 500 },
    totalDuration: 825,
    totalStops: 2,
    refundable: false,
};

const roundTrip = {
    ...base,
    segments: [
        seg(0, 'SFO', 'DEN', '2026-09-12T08:00:00', '2026-09-12T11:30:00'),
        seg(0, 'DEN', 'JFK', '2026-09-12T12:45:00', '2026-09-12T18:40:00'),
        seg(1, 'JFK', 'ORD', '2026-09-16T07:15:00', '2026-09-16T09:05:00'),
        seg(1, 'ORD', 'SFO', '2026-09-16T10:00:00', '2026-09-16T13:20:00'),
    ],
    sliceDurations: [400, 425],
    tripType: 'round-trip',
} as FlightOffer;

describe('FlightItinerarySummary', () => {
    it('shows the return leg the traveller is about to pay for', () => {
        render(<FlightItinerarySummary offer={roundTrip} />);

        expect(screen.getByText('Outbound')).toBeTruthy();
        expect(screen.getByText('Return')).toBeTruthy();
    });

    it('gives each leg its own stop count instead of the trip total', () => {
        render(<FlightItinerarySummary offer={roundTrip} />);

        // Both legs stop once. The offer's totalStops of 2 describes neither of them.
        expect(screen.getAllByText(/1 stop/)).toHaveLength(2);
        expect(screen.queryByText(/2 stop/)).toBeNull();
    });

    it('does not label a one-way journey as an outbound leg', () => {
        const oneWay = {
            ...base,
            segments: [
                seg(0, 'SFO', 'DEN', '2026-09-12T08:00:00', '2026-09-12T11:30:00'),
                seg(0, 'DEN', 'JFK', '2026-09-12T12:45:00', '2026-09-12T18:40:00'),
            ],
            sliceDurations: [400],
            totalStops: 1,
            tripType: 'one-way',
        } as FlightOffer;

        render(<FlightItinerarySummary offer={oneWay} />);

        expect(screen.queryByText('Outbound')).toBeNull();
        expect(screen.queryByText('Return')).toBeNull();
        expect(screen.getByText(/1 stop/)).toBeTruthy();
    });

    it('dates each leg, so the return is not read as leaving the same day', () => {
        render(<FlightItinerarySummary offer={roundTrip} />);

        // Outbound leaves 12 Sep; the return leaves 16 Sep, four days later.
        expect(screen.getByText(/Sep 12/)).toBeTruthy();
        expect(screen.getByText(/Sep 16/)).toBeTruthy();
    });
});
