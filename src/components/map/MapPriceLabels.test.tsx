import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

/**
 * QA BG-3: a hotel with no rate showed "₱0" on the map, which reads as a free room.
 * No price must render as no price — on a lone hotel and on a cluster of them.
 */

vi.mock('react-map-gl/mapbox', () => ({
    Marker: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

import { MapMarker } from './MapMarker';
import { ClusterMarker } from './ClusterMarker';

const property = { id: 'h1', name: 'Super 8', coordinates: { lat: 1, lng: 1 } } as never;
const noop = () => {};

describe('map price labels', () => {
    it('shows a lone hotel\'s rate', () => {
        render(<MapMarker property={property} displayPrice={2450} displayCurrency="PHP" isSelected={false} isHovered={false} onClick={noop} onHover={noop} index={40} />);
        expect(screen.getByText(/2,450/)).toBeInTheDocument();
    });

    it('shows no price, not ₱0, for a lone hotel without a rate', () => {
        const { container } = render(<MapMarker property={property} displayPrice={0} displayCurrency="PHP" isSelected={false} isHovered={false} onClick={noop} onHover={noop} index={40} />);
        expect(container.textContent).toBe('40');
    });

    it('shows no "from" price, not ₱0+, for a cluster where nobody has a rate', () => {
        const { container } = render(<ClusterMarker latitude={1} longitude={1} count={3} minPrice={0} currency="PHP" onClick={noop} />);
        expect(container.textContent).toBe('3 hotels');
    });

    it('shows a cluster\'s cheapest rate when there is one', () => {
        render(<ClusterMarker latitude={1} longitude={1} count={3} minPrice={1800} currency="PHP" onClick={noop} />);
        expect(screen.getByText(/1,800/)).toBeInTheDocument();
    });
});
