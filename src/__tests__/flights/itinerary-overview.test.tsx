import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/locales/en.json';

/**
 * The head of the book page's itinerary card: a row per direction, each with its own
 * total over the rule and its own stops beneath it.
 *
 * Rendered against the real message catalogue so the plural stop copy is exercised.
 */

import { FlightItineraryOverview } from '@/components/flights/FlightItineraryOverview';
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
        flightNumber: `QR${from}`,
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
    price: { total: 1212, base: 1000, taxes: 212, currency: 'USD', pricePerAdult: 1212 },
    totalDuration: 0,
    totalStops: 2,
    refundable: false,
};

// CRK → DOH → LHR out (2h 40m at Doha), LHR → DOH → CRK back two days later.
const roundTrip = {
    ...base,
    segments: [
        seg(0, 'CRK', 'DOH', '2026-09-28T18:40:00', '2026-09-28T22:30:00'),
        seg(0, 'DOH', 'LHR', '2026-09-29T01:10:00', '2026-09-29T06:25:00'),
        seg(1, 'LHR', 'DOH', '2026-09-30T19:25:00', '2026-10-01T05:00:00'),
        seg(1, 'DOH', 'CRK', '2026-10-01T07:40:00', '2026-10-02T03:50:00'),
    ],
    sliceDurations: [1125, 2245],
    tripType: 'round-trip',
} as FlightOffer;

describe('FlightItineraryOverview', () => {
    it('names each direction and the moment it sets off', () => {
        renderIntl(<FlightItineraryOverview offer={roundTrip} />);

        expect(screen.getByText('Outbound')).toBeTruthy();
        expect(screen.getByText('Mon, Sep 28, 2026, 6:40 PM')).toBeTruthy();
        expect(screen.getByText('Return')).toBeTruthy();
        expect(screen.getByText('Wed, Sep 30, 2026, 7:25 PM')).toBeTruthy();
    });

    it("gives each direction its own total, not the trip's", () => {
        const { container } = renderIntl(<FlightItineraryOverview offer={roundTrip} />);

        expect(container.textContent).toContain('Total Flight Duration 18h 45m');
        expect(container.textContent).toContain('Total Flight Duration 1d 13h 25m');
    });

    it('counts stops per direction and says where and how long each one is', () => {
        const { container } = renderIntl(<FlightItineraryOverview offer={roundTrip} />);

        expect(screen.getAllByText('1 stop')).toHaveLength(2);
        // Both directions connect at Doha for 2h 40m — once each, never summed.
        expect(container.textContent?.match(/1 stop 02h 40m Hamad International Airport \(DOH\)/g)).toHaveLength(2);
    });

    it('marks an arrival on a later day with how many days later', () => {
        const { container } = renderIntl(<FlightItineraryOverview offer={roundTrip} />);

        expect(container.textContent).toContain('6:25 AM + 1');
        expect(container.textContent).toContain('3:50 AM + 2');
    });

    it('leaves a one-way journey unlabelled and calls a direct flight nonstop', () => {
        const oneWay = {
            ...base,
            segments: [seg(0, 'CRK', 'DOH', '2026-09-28T18:40:00', '2026-09-28T22:30:00')],
            sliceDurations: [530],
        } as FlightOffer;

        renderIntl(<FlightItineraryOverview offer={oneWay} />);

        expect(screen.queryByText('Outbound')).toBeNull();
        expect(screen.getByText('Nonstop')).toBeTruthy();
        expect(screen.getByText('Clark International Airport (CRK)')).toBeTruthy();
    });
});
