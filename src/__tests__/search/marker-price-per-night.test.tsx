import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { nightsBetween } from '@/lib/perNightPrice';

/**
 * A map marker renders the search price as it arrives.
 *
 * `property.price` on a search result is already a **Nightly Rate**: `/api/search/stream`
 * divides the supplier's stay total before putting it on the wire. So a marker converts
 * currency and nothing else.
 *
 * This file used to assert the opposite, and that is worth keeping in view. It declared a
 * fixture as `price: 31, // whole stay, 4 nights` and required the marker to render $8 —
 * true of the wire at the time. When the division moved to the server the fixture was never
 * revisited, so the test went on passing against an assumption the wire no longer honoured
 * while production advertised half price on every multi-night search: ₱1,587 on a marker for
 * a room the property page sold at ₱3,173.
 *
 * The lesson is in the fixture, not the assertion. A component test that invents its own
 * input can only ever check the component against the author's belief about the input, and
 * a belief does not fail when the producer changes. `nightly-rate-divided-once.test.ts`
 * carries the half that reads both sides.
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
    // As the search stream sends it: one night, already divided.
    price: 31,
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

describe('selected hotel marker', () => {
    it('renders the nightly rate it was given, undivided', () => {
        // Four nights are in scope via useDates, so a marker that still divided would show
        // $8. The number arriving is already per night; dividing it again is the bug.
        render(
            <SelectedPropertyPopup
                selectedProperty={property}
                onClose={() => {}}
                onViewDetails={() => {}}
                onSelect={() => {}}
                isMobile
            />
        );

        const rendered = screen.getByTestId('marker').textContent ?? '';
        expect(rendered).toContain('$31');
        expect(rendered).not.toContain('$8');
    });

    it('still converts currency', () => {
        render(
            <SelectedPropertyPopup
                selectedProperty={{ ...property, price: 52000, currency: 'KRW' }}
                onClose={() => {}}
                onViewDetails={() => {}}
                onSelect={() => {}}
                isMobile
            />
        );

        // 52,000 KRW ÷ 1300 = $40. Converted, not divided by the four nights.
        expect(screen.getByTestId('marker').textContent).toContain('$40');
    });
});
