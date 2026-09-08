import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import en from '@/locales/en.json';

/**
 * The book page used to render one strip filled with offer-wide figures: a round trip
 * showed `totalStops` (outbound + return summed) beside the first segment's departure
 * and the LAST segment's arrival, so a 1-stop-each-way SFO→JFK read
 * "SFO 08:00 → SFO 13:20 · 2 stop(s)" while the search card said "1 stop" for the very
 * same offer. A strip describes one slice; these hold it to that.
 */

// Real copy, real interpolation — a strip that says "{count} stop(s)" is not fixed.
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

import { FlightSliceStrip } from '@/components/flights/FlightSliceStrip';
import { offerSlices } from '@/lib/flights/offer-slices';
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
} as FlightOffer;

describe('FlightSliceStrip', () => {
    it('counts only the stops on the slice it shows', () => {
        const [outbound] = offerSlices(roundTrip);

        render(<FlightSliceStrip slice={outbound} />);

        expect(screen.getByText(/1 stop/)).toBeTruthy();
        expect(screen.queryByText(/2 stop/)).toBeNull();
    });

    it('ends where the slice ends, not where the trip ends', () => {
        const [outbound] = offerSlices(roundTrip);

        render(<FlightSliceStrip slice={outbound} />);

        expect(screen.getByText('JFK')).toBeTruthy();
        // SFO is where the outbound departs; it must not also be the arrival.
        expect(screen.getAllByText('SFO')).toHaveLength(1);
    });

    it('shows the slice duration, not the trip total', () => {
        const [outbound] = offerSlices(roundTrip);

        render(<FlightSliceStrip slice={outbound} />);

        expect(screen.getByText('6h 40m')).toBeTruthy();
        expect(screen.queryByText('13h 45m')).toBeNull();
    });

    it('names each connection airport', () => {
        const [outbound] = offerSlices(roundTrip);

        render(<FlightSliceStrip slice={outbound} />);

        expect(screen.getByText(/DEN/)).toBeTruthy();
    });

    it('says nonstop when the slice has no connection', () => {
        const nonstop = { ...roundTrip, segments: [seg(0, 'SFO', 'JFK', '2026-09-12T08:00:00', '2026-09-12T16:40:00')] };

        render(<FlightSliceStrip slice={offerSlices(nonstop)[0]} />);

        expect(screen.getByText('Nonstop')).toBeTruthy();
    });
});
