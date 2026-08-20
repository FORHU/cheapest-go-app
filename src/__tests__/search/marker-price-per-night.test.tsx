import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { nightsBetween, toPerNight } from '@/lib/perNightPrice';

/**
 * TGX quotes property.price as a gross total for the whole stay, and every price
 * surface is labelled "/night". The map markers used to render that total as-is,
 * so a 4-night stay showed the same hotel as $31 on its marker and $8 on the card
 * sitting directly on top of it. These lock the two together.
 */

const checkIn = new Date('2026-09-25T00:00:00Z');
const checkOut = new Date('2026-09-29T00:00:00Z'); // 4 nights

vi.mock('@/stores/searchStore', () => ({
    useUserCurrency: () => 'USD',
    useDates: () => ({ checkIn, checkOut }),
}));

vi.mock('@/lib/currency', () => ({
    convertCurrency: (amount: number, from: string, to: string) =>
        from === to ? amount : from === 'KRW' && to === 'USD' ? amount / 1300 : amount,
}));

vi.mock('react-map-gl/mapbox', () => ({
    Marker: ({ children }: any) => React.createElement('div', { 'data-testid': 'marker' }, children),
}));

vi.mock('@/components/map/MapPopup', () => ({ MapPopup: () => null }));

import { SelectedPropertyPopup } from '@/components/mapbox/components/SelectedPropertyPopup';

const property: any = {
    id: 'p1',
    name: 'Sujeongjang Inn',
    price: 31,          // whole stay, 4 nights
    currency: 'USD',
    coordinates: { lat: 37.5, lng: 127.0 },
};

describe('nightsBetween', () => {
    it('counts whole nights', () => {
        expect(nightsBetween(checkIn, checkOut)).toBe(4);
    });

    it('falls back to 1 when the search has no dates', () => {
        expect(nightsBetween(null, null)).toBe(1);
        expect(nightsBetween(checkIn, checkIn)).toBe(1);
    });
});

describe('toPerNight', () => {
    it('divides the stay total across nights', () => {
        expect(toPerNight(31, 'USD', 'USD', 4)).toBeCloseTo(7.75);
    });

    it('converts before dividing', () => {
        expect(toPerNight(52000, 'KRW', 'USD', 4)).toBeCloseTo(10);
    });

    it('never divides by zero', () => {
        expect(toPerNight(31, 'USD', 'USD', 0)).toBe(31);
    });
});

describe('selected hotel marker', () => {
    it('shows the per-night price, not the stay total', () => {
        render(
            <SelectedPropertyPopup
                selectedProperty={property}
                onClose={() => {}}
                onViewDetails={() => {}}
                onSelect={() => {}}
                isMobile
            />
        );

        // $31 / 4 nights = $7.75, rendered at zero decimals.
        expect(screen.getByTestId('marker').textContent).toContain('$8');
        expect(screen.getByTestId('marker').textContent).not.toContain('$31');
    });
});
