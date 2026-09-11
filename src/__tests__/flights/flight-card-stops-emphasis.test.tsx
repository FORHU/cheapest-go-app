import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/locales/en.json';

/**
 * The centre column of a result row states two things as "label: value" —
 * "Total Flight Duration 18h 50m" and "Stops: 1 Stop". The label is quiet by design;
 * the value is what the traveller is scanning for. The stop count is the one worth
 * picking out of the row, so it carries the colour and the label stays muted.
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

function seg(from: string, to: string, dep: string, arr: string): FlightSegmentDetail {
    return {
        segmentIndex: 0,
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

const oneStop = {
    offerId: 'off_1',
    provider: 'duffel',
    price: { total: 1372.7, base: 1200, taxes: 172.7, currency: 'USD', pricePerAdult: 1373 },
    segments: [
        seg('CRK', 'DOH', '2026-09-23T18:40:00', '2026-09-23T22:30:00'),
        seg('DOH', 'LHR', '2026-09-24T01:15:00', '2026-09-24T06:30:00'),
    ],
    sliceDurations: [1130],
    totalDuration: 1130,
    totalStops: 1,
    refundable: false,
    baggage: { carryOnBags: 1, checkedBags: 1 },
    tripType: 'one-way',
} as FlightOffer;

const nonstop = {
    ...oneStop,
    segments: [seg('CRK', 'MNL', '2026-09-23T08:00:00', '2026-09-23T09:15:00')],
    totalStops: 0,
    sliceDurations: [75],
    totalDuration: 75,
} as FlightOffer;

describe('FlightCard — the stop count', () => {
    it('picks the stop count out in orange', () => {
        renderIntl(<FlightCard offer={oneStop} />);

        const value = screen.getByText('1 Stop');
        expect(value.className).toMatch(/(^|\s)text-orange-\d+/);
    });

    it('carries the colour in dark mode too', () => {
        renderIntl(<FlightCard offer={oneStop} />);

        expect(screen.getByText('1 Stop').className).toMatch(/dark:text-orange-\d+/);
    });

    it('leaves the "Stops:" label muted — the value is the thing being read', () => {
        renderIntl(<FlightCard offer={oneStop} />);

        const label = screen.getByText('1 Stop').parentElement!;
        expect(label.textContent).toBe('Stops:1 Stop');
        expect(label.className).not.toMatch(/text-orange-/);
    });

    it('leaves the duration beside it alone', () => {
        // Only the stop count is being picked out; colouring both emphasises neither.
        renderIntl(<FlightCard offer={oneStop} />);

        expect(screen.getByText('18h 50m').className).not.toMatch(/text-orange-/);
    });

    it('colours a nonstop the same way, so the eye lands in the same place', () => {
        renderIntl(<FlightCard offer={nonstop} />);

        expect(screen.getByText('Nonstop').className).toMatch(/(^|\s)text-orange-\d+/);
    });
});
