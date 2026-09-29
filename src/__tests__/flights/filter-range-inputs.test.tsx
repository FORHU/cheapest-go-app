import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/locales/en.json';
import FlightFilters from '@/components/flights/filters';
import type { FlightFilterState } from '@/lib/flights/filter-offers';
import type { FlightOffer } from '@/types/flights';

/**
 * Every slider in the filter panel states its values in fields the traveller can type
 * into — a price, a clock time, a number of hours — instead of labels they can only
 * drag towards. A typed value takes effect on Enter or on leaving the field, is held
 * inside what the results actually span, and an unreadable one is simply put back.
 */

function offer(id: string, price: number, departs: string, arrives: string, minutes: number): FlightOffer {
    return {
        offerId: id,
        provider: 'duffel',
        price: { total: price, base: price, taxes: 0, currency: 'USD', pricePerAdult: price },
        segments: [{
            segmentIndex: 0,
            airline: { code: 'QR', name: 'Qatar Airways' },
            origin: 'CRK', destination: 'DOH', flightNumber: `QR${id}`,
            departure: { airport: 'CRK', time: `2026-09-23T${departs}:00` },
            arrival: { airport: 'DOH', time: `2026-09-23T${arrives}:00` },
            duration: minutes, stops: 0, cabinClass: 'economy',
        }],
        sliceDurations: [minutes],
        totalDuration: minutes,
        totalStops: 0,
        refundable: false,
        tripType: 'one-way',
    } as FlightOffer;
}

// Prices $500–$1,500, flights 5h to 15h.
const offers = [
    offer('1', 500, '06:00', '11:00', 300),
    offer('2', 1500, '18:30', '23:30', 900),
];

function renderPanel() {
    const onFilterChange = vi.fn<(f: FlightFilterState) => void>();
    render(
        <NextIntlClientProvider locale="en" messages={en as never} timeZone="UTC">
            <FlightFilters onFilterChange={onFilterChange} allOffers={offers} />
        </NextIntlClientProvider>,
    );
    const last = () => onFilterChange.mock.calls.at(-1)?.[0];
    return { onFilterChange, last };
}

function commit(input: HTMLElement, value: string) {
    fireEvent.change(input, { target: { value } });
    fireEvent.blur(input);
}

describe('FlightFilters — price fields', () => {
    const min = () => screen.getByRole('spinbutton', { name: 'Price Per Person from' });
    const max = () => screen.getByRole('spinbutton', { name: 'Price Per Person to' });

    it('shows the price range as two editable amounts', () => {
        renderPanel();
        expect(min()).toHaveValue(500);
        expect(max()).toHaveValue(1500);
    });

    it('applies a typed minimum when the field is left', () => {
        const { last } = renderPanel();
        commit(min(), '800');
        expect(last()?.priceRange).toEqual([800, 1500]);
    });

    it('applies a typed maximum on Enter', () => {
        const { last } = renderPanel();
        fireEvent.change(max(), { target: { value: '1200' } });
        fireEvent.keyDown(max(), { key: 'Enter' });
        expect(last()?.priceRange).toEqual([500, 1200]);
    });

    it('holds a typed amount inside the prices on offer', () => {
        const { last } = renderPanel();
        commit(max(), '99999');
        expect(last()?.priceRange).toEqual([500, 1500]);
        commit(min(), '10');
        expect(last()?.priceRange).toEqual([500, 1500]);
    });

    it('never lets the minimum pass the maximum', () => {
        const { last } = renderPanel();
        commit(max(), '900');
        commit(min(), '1000');
        expect(last()?.priceRange).toEqual([900, 900]);
    });

    it('puts an unreadable amount back and changes nothing', () => {
        const { onFilterChange } = renderPanel();
        commit(min(), '');
        expect(onFilterChange).not.toHaveBeenCalled();
        expect(min()).toHaveValue(500);
    });

    it('follows the slider when the knob is dragged', () => {
        renderPanel();
        fireEvent.change(screen.getByRole('slider', { name: 'Price Per Person — minimum' }), { target: { value: '700' } });
        expect(min()).toHaveValue(700);
    });
});

describe('FlightFilters — time fields', () => {
    it('applies a typed earliest departure', () => {
        const { last } = renderPanel();
        commit(screen.getByLabelText('Departure from'), '08:30');
        expect(last()?.departureWindow).toEqual([510, 1439]);
    });

    it('applies a typed latest arrival', () => {
        const { last } = renderPanel();
        commit(screen.getByLabelText('Arrival to'), '20:00');
        expect(last()?.arrivalWindow).toEqual([0, 1200]);
    });

    it('shows the window as clock times', () => {
        renderPanel();
        expect(screen.getByLabelText('Departure from')).toHaveValue('00:00');
        expect(screen.getByLabelText('Departure to')).toHaveValue('23:59');
    });
});

describe('FlightFilters — duration field', () => {
    const hours = () => screen.getByRole('spinbutton', { name: 'Flight Duration' });

    it('reads "Under [n] hours" with the hours editable', () => {
        renderPanel();
        expect(hours()).toHaveValue(15);
        expect(hours().closest('p')).toHaveTextContent(/^Under\s*hours$/);
    });

    it('caps the duration at the typed number of hours', () => {
        const { last } = renderPanel();
        commit(hours(), '10');
        expect(last()?.maxDurationMinutes).toBe(600);
    });

    it('holds typed hours inside the durations on offer', () => {
        const { last } = renderPanel();
        commit(hours(), '40');
        expect(last()?.maxDurationMinutes).toBe(900);
        commit(hours(), '1');
        expect(last()?.maxDurationMinutes).toBe(300);
    });
});
