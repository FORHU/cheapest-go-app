import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/locales/en.json';

/**
 * The loading states on the flight search page are drawn from the cards they stand in
 * for: the same surface as a result card and as the filter panel, and the placeholder
 * card's price rail at the real card's width, so nothing jumps when the results land.
 */

vi.mock('@/stores/searchStore', () => ({ useUserCurrency: () => 'USD' }));
vi.mock('@/components/common/SaveButton', () => ({ default: () => null }));

import { FlightCardSkeleton, FlightResults } from '@/components/flights/flightResultsList';
import { CARD_SURFACE_BASE, CARD_SURFACE_IDLE } from '@/components/flights/FilterCard';

const classes = (s: string) => s.split(/\s+/).filter(Boolean);

// The resting look only — a placeholder is not something to hover.
const restingSurface = [
    ...classes(CARD_SURFACE_BASE),
    ...classes(CARD_SURFACE_IDLE).filter(c => !c.includes('hover:')),
];

describe('FlightCardSkeleton', () => {
    it('rests on the result card surface', () => {
        const { container } = render(<FlightCardSkeleton />);
        expect(container.firstElementChild).toHaveClass(...restingSurface);
    });

    it('does not lift under the pointer like a real card', () => {
        const { container } = render(<FlightCardSkeleton />);
        expect((container.firstElementChild as HTMLElement).className).not.toContain('hover:');
    });

    it('reserves the price rail at the card\'s 240px width', () => {
        const { container } = render(<FlightCardSkeleton />);
        const rail = container.querySelector('[data-skeleton="price-rail"]');
        expect(rail).not.toBeNull();
        expect(rail).toHaveClass('lg:w-[240px]', 'lg:shrink-0');
    });
});

describe('FlightResults while searching', () => {
    it('draws the waiting panel on the result card surface', () => {
        render(
            <NextIntlClientProvider locale="en" messages={en as never} timeZone="UTC">
                <FlightResults offers={[]} loading />
            </NextIntlClientProvider>,
        );
        expect(screen.getByRole('status')).toHaveClass(...restingSurface);
    });
});
