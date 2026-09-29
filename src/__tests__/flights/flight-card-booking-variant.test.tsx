import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/locales/en.json';

/**
 * The search page's flight card, reused on the book page: the same card, but
 * the flight is already chosen — it opens on its itineraries and carries no
 * Select button, save heart or fare alternatives.
 */

vi.mock('framer-motion', () => ({
    motion: new Proxy({}, { get: () => (p: any) => React.createElement('div', { className: p.className }, p.children) }),
    AnimatePresence: ({ children }: any) => React.createElement(React.Fragment, null, children),
}));
vi.mock('@/stores/searchStore', () => ({ useUserCurrency: () => 'USD' }));
vi.mock('@/components/common/SaveButton', () => ({ default: () => <button>save</button> }));

import { FlightCard } from '@/components/flights/flightCard';
import type { FlightOffer } from '@/types/flights';

const seg = (from: string, to: string, dep: string, arr: string, flightNumber: string) => ({
    segmentIndex: 0,
    airline: { code: 'BR', name: 'EVA Air' },
    origin: from,
    destination: to,
    flightNumber,
    departure: { airport: from, time: dep },
    arrival: { airport: to, time: arr },
    duration: 120,
    stops: 0,
    cabinClass: 'economy',
});

const offer = {
    offerId: 'off_1',
    provider: 'duffel',
    price: { total: 1445, base: 1200, taxes: 245, currency: 'USD', pricePerAdult: 1445 },
    segments: [
        seg('CRK', 'TPE', '2026-10-01T12:00:00', '2026-10-01T14:00:00', 'BR0234'),
        seg('TPE', 'LHR', '2026-10-02T08:00:00', '2026-10-02T19:20:00', 'BR0067'),
    ],
    sliceDurations: [1880],
    totalDuration: 1880,
    totalStops: 1,
    refundable: false,
    alternatives: [{ offerId: 'alt', provider: 'duffel', price: { total: 1600, currency: 'USD' }, segments: [seg('CRK', 'TPE', '2026-10-01T12:00:00', '2026-10-01T14:00:00', 'BR0234')] }],
    tripType: 'one-way',
} as unknown as FlightOffer;

function renderCard(props: Partial<React.ComponentProps<typeof FlightCard>> = {}) {
    return render(
        <NextIntlClientProvider locale="en" messages={en as never} timeZone="UTC">
            <FlightCard offer={offer} {...props} />
        </NextIntlClientProvider>,
    );
}

describe('FlightCard — booking variant', () => {
    it('opens on the flight itineraries', () => {
        renderCard({ variant: 'booking' });
        expect(screen.getByRole('button', { name: /Hide flight itineraries/ })).toBeInTheDocument();
        expect(screen.getAllByText(/Taiwan Taoyuan|TPE/).length).toBeGreaterThan(0);
    });

    it('can still fold the itineraries away', () => {
        renderCard({ variant: 'booking' });
        fireEvent.click(screen.getByRole('button', { name: /Hide flight itineraries/ }));
        expect(screen.getByRole('button', { name: /Show flight itineraries/ })).toBeInTheDocument();
    });

    it('drops what only makes sense while choosing: Select, save and the fare alternatives', () => {
        renderCard({ variant: 'booking' });
        expect(screen.queryByRole('button', { name: /Select/ })).not.toBeInTheDocument();
        expect(screen.queryByText('save')).not.toBeInTheDocument();
        expect(screen.queryByText(/Available fare options/i)).not.toBeInTheDocument();
    });

    it('states the booking total on the airline row, over a "total price" caption', () => {
        renderCard({ variant: 'booking', totalPrice: 1520 });
        const total = screen.getByTestId('booking-total');
        expect(total).toHaveTextContent('$1,520');
        expect(total).toHaveTextContent('total price');
        // Same row as the airline name, pushed to its far end.
        expect(total).toHaveClass('ml-auto');
        expect(total.parentElement).toContainElement(screen.getByText('EVA Air'));
    });

    it('falls back to the fare when no running total is given', () => {
        renderCard({ variant: 'booking' });
        expect(screen.getByTestId('booking-total')).toHaveTextContent('$1,445');
    });

    it('shows no booking total on a search result', () => {
        renderCard();
        expect(screen.queryByTestId('booking-total')).not.toBeInTheDocument();
    });

    it('keeps the search result card unchanged by default', () => {
        renderCard();
        expect(screen.getByRole('button', { name: /Select/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Compare|Show flight itineraries/ })).toBeInTheDocument();
    });
});
