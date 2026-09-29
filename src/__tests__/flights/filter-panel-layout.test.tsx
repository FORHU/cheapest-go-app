import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/locales/en.json';
import FlightFilters from '@/components/flights/filters';
import type { FlightOffer } from '@/types/flights';

/**
 * The filter panel's controls, sized for the 288px card they sit in:
 *   - times and flight duration are typed, not dragged — no slider — and their fields
 *     sit on their own line under the label, sharing the card's width;
 *   - the select-all and refundable switches are the compact size;
 *   - every Reset link shows the pointer.
 */

function offer(id: string, price: number, departs: string, minutes: number): FlightOffer {
    return {
        offerId: id,
        provider: 'duffel',
        price: { total: price, base: price, taxes: 0, currency: 'USD', pricePerAdult: price },
        segments: [{
            segmentIndex: 0,
            airline: { code: 'QR', name: 'Qatar Airways' },
            origin: 'CRK', destination: 'DOH', flightNumber: `QR${id}`,
            departure: { airport: 'CRK', time: `2026-09-23T${departs}:00` },
            arrival: { airport: 'DOH', time: '2026-09-23T23:30:00' },
            duration: minutes, stops: 0, cabinClass: 'economy',
        }],
        sliceDurations: [minutes],
        totalDuration: minutes,
        totalStops: 0,
        refundable: false,
        tripType: 'one-way',
    } as FlightOffer;
}

const offers = [offer('1', 500, '06:00', 300), offer('2', 1500, '18:30', 900)];

function renderPanel() {
    render(
        <NextIntlClientProvider locale="en" messages={en as never} timeZone="UTC">
            <FlightFilters onFilterChange={vi.fn()} allOffers={offers} />
        </NextIntlClientProvider>,
    );
}

describe('FlightFilters — typed-only times and duration', () => {
    it('draws no slider for the departure or arrival window', () => {
        renderPanel();
        expect(screen.queryByRole('slider', { name: /Departure/ })).toBeNull();
        expect(screen.queryByRole('slider', { name: /Arrival/ })).toBeNull();
    });

    it('draws no slider for the flight duration', () => {
        renderPanel();
        expect(screen.queryByRole('slider', { name: /Flight Duration/ })).toBeNull();
    });

    it('keeps the price slider', () => {
        renderPanel();
        expect(screen.getAllByRole('slider', { name: /Price Per Person/ })).toHaveLength(2);
    });

    it('puts the time fields on their own line under the label', () => {
        renderPanel();
        for (const label of ['Departure', 'Arrival']) {
            const heading = screen.getByText(label, { selector: 'span' });
            const field = screen.getByLabelText(`${label} from`);
            // The label takes a line of its own…
            expect(heading).toHaveClass('block');
            // …the fields' row does not hold it…
            expect(field.parentElement!.contains(heading)).toBe(false);
            // …and comes after it.
            expect(heading.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        }
    });

    it('lets the two time fields share the card width instead of a fixed one', () => {
        renderPanel();
        for (const name of ['Departure from', 'Departure to', 'Arrival from', 'Arrival to']) {
            const field = screen.getByLabelText(name);
            expect(field).toHaveClass('flex-1', 'min-w-0');
            expect(field.className).not.toMatch(/\bw-\[/);
        }
    });
});

describe('FlightFilters — switches', () => {
    it('draws the switches at the compact size', () => {
        renderPanel();
        const switches = screen.getAllByRole('switch');
        expect(switches.length).toBeGreaterThan(0);
        for (const sw of switches) {
            expect(sw).toHaveClass('h-5', 'w-8');
            expect(sw).not.toHaveClass('h-6');
        }
    });
});

describe('FlightFilters — Reset links', () => {
    it('shows the pointer over a Reset link', () => {
        renderPanel();
        fireEvent.click(screen.getByRole('button', { name: /^Direct/ }));
        const reset = screen.getByRole('button', { name: 'Reset' });
        expect(reset).toHaveClass('cursor-pointer');
    });
});
