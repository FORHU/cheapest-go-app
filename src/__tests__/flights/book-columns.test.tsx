import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FlightBookColumns } from '@/components/flights/booking/FlightBookColumns';

/**
 * The flight book page's frame (Figma "Version 1"): the trip heading over two
 * equal columns — the flight on the left, the passenger and payment cards on
 * the right — stacking to one column below the lg breakpoint.
 */

function renderColumns() {
    return render(
        <FlightBookColumns heading="Round trip to Taiwan Taoyuan International Airport (TPE)" flight={<p>flight card</p>}>
            <p>passenger card</p>
        </FlightBookColumns>,
    );
}

describe('FlightBookColumns', () => {
    it('heads the page with the trip', () => {
        renderColumns();
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Round trip to Taiwan Taoyuan International Airport (TPE)');
    });

    it('puts the flight in the left column, ahead of the form cards', () => {
        renderColumns();
        const flight = screen.getByText('flight card');
        const form = screen.getByText('passenger card');
        expect(flight.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(flight.closest('aside')).not.toBeNull();
        expect(form.closest('aside')).toBeNull();
    });

    it('lays the two columns side by side from lg up, equal width', () => {
        renderColumns();
        const grid = screen.getByText('flight card').closest('aside')!.parentElement!;
        expect(grid).toHaveClass('grid', 'grid-cols-1', 'lg:grid-cols-2');
    });

    it('keeps the flight card in view while the form scrolls', () => {
        renderColumns();
        expect(screen.getByText('flight card').closest('aside')).toHaveClass('lg:sticky');
    });
});
