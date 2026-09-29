import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';

/**
 * A fresh flight search covers the page with the flight results layout while
 * it navigates — the same header, filter card and result cards the results
 * page draws — not the hotel list's photo-and-text rows.
 */

vi.mock('@/components/common/SaveButton', () => ({ default: () => null }));

import { useSearchStore } from '@/stores/searchStore';
import { SearchNavigationOverlay } from '@/components/search/SearchNavigationOverlay';
import { FlightSearchSkeleton } from '@/components/flights/FlightSearchSkeleton';
import { RESULT_CARD_RESTING } from '@/components/flights/FilterCard';

const surface = RESULT_CARD_RESTING.split(/\s+/).filter(Boolean);

describe('FlightSearchSkeleton', () => {
    it('lays out the results page: header, filter card, result cards', () => {
        const { container } = render(<FlightSearchSkeleton />);
        expect(container.querySelector('[data-skeleton="page-header"]')).toBeTruthy();
        expect(container.querySelector('[data-skeleton="filters"] > div')).toHaveClass(...surface);
        const results = container.querySelector('[data-skeleton="results"]')!;
        // Spaced as the results list spaces its cards, and enough of them to run past the fold.
        expect(results).toHaveClass('space-y-3');
        expect(results.children).toHaveLength(5);
        for (const card of Array.from(results.children)) expect(card).toHaveClass(...surface);
    });

    it('draws the filter panel as the loaded page shows it: sort, airlines, stops, price, times, duration', () => {
        const { container } = render(<FlightSearchSkeleton />);
        const sections = container.querySelectorAll('[data-skeleton="filters"] section');
        expect(Array.from(sections).map(s => s.getAttribute('data-section'))).toEqual(
            ['sort', 'airlines', 'stops', 'price', 'times', 'duration'],
        );
        // Ruled off from one another as the real sections are.
        expect(sections[0]).not.toHaveClass('border-t');
        for (const s of Array.from(sections).slice(1)) expect(s).toHaveClass('border-t', 'pt-4', 'mt-4');
    });

    it('draws each result as the flight card placeholder, price rail included', () => {
        const { container } = render(<FlightSearchSkeleton />);
        expect(container.querySelectorAll('[data-skeleton="results"] [data-skeleton="price-rail"]')).toHaveLength(5);
    });
});

describe('SearchNavigationOverlay', () => {
    beforeEach(() => act(() => useSearchStore.getState().setIsSearching(false)));

    it('shows nothing when no search is running', () => {
        const { container } = render(<SearchNavigationOverlay />);
        expect(container).toBeEmptyDOMElement();
    });

    it('shows the flight results skeleton for a flight search', () => {
        act(() => useSearchStore.getState().setIsSearching(true, 'flights'));
        render(<SearchNavigationOverlay />);
        const skeleton = screen.getByRole('status', { name: 'Loading flights' });
        // Below the sticky site header, on the page's grid ground.
        expect(skeleton.parentElement).toHaveClass('top-[45px]', 'md:top-[57px]', 'bg-grid-alabaster');
    });

    it('keeps the hotel skeleton for any other search', () => {
        act(() => useSearchStore.getState().setIsSearching(true));
        render(<SearchNavigationOverlay />);
        expect(screen.queryByRole('status', { name: 'Loading flights' })).not.toBeInTheDocument();
    });
});
