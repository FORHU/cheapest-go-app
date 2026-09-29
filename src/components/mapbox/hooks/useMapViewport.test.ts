/**
 * Whether the camera follows the search.
 *
 * It did not. `selectedId` is state on the results page and nothing cleared it between
 * searches, so a hotel picked in Paris stayed "selected" against a New York list — matching
 * no card, highlighting nothing, and skipping the refit every time. The map sat on the Paris
 * street corner the selection had flown it to while the list read New York.
 */
import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useMapViewport } from './useMapViewport';
import type { MappableProperty } from '../utils/buildGeoJson';

const flyTo = vi.fn();
const fitBounds = vi.fn();
const mapRef = { current: { flyTo, fitBounds } } as never;

/** Hotels spread far enough apart that the hook fits bounds rather than flying to one. */
const hotelsAround = (prefix: string, lat: number, lng: number): MappableProperty[] =>
    Array.from({ length: 5 }, (_, i) => ({
        id: `${prefix}-${i}`,
        coordinates: { lat: lat + i * 0.01, lng: lng + i * 0.01 },
    })) as MappableProperty[];

const PARIS = hotelsAround('paris', 48.8566, 2.3522);
const NEW_YORK = hotelsAround('ny', 40.7128, -74.006);

const run = (properties: MappableProperty[], selectedId: string | null) =>
    renderHook(
        (p: { properties: MappableProperty[]; selectedId: string | null }) =>
            useMapViewport({ mapRef, isMapLoaded: true, properties: p.properties, selectedId: p.selectedId }),
        { initialProps: { properties, selectedId } },
    );

describe('useMapViewport', () => {
    beforeEach(() => { flyTo.mockClear(); fitBounds.mockClear(); });

    it('moves to the hotels when a search answers', () => {
        run(PARIS, null);
        expect(fitBounds).toHaveBeenCalledTimes(1);
    });

    it('holds still for a hotel the traveller is looking at', () => {
        // Prices and photos stream in after the list does; refitting then would yank the
        // map out from under someone reading a card.
        run(PARIS, 'paris-2');
        expect(fitBounds).not.toHaveBeenCalled();
    });

    it('follows a new search even though the old selection is still set', () => {
        const { rerender } = run(PARIS, 'paris-2');
        expect(fitBounds).not.toHaveBeenCalled();

        // Searching New York without clearing the Paris selection: the id now matches no
        // hotel on screen, so it is not a selection worth protecting.
        rerender({ properties: NEW_YORK, selectedId: 'paris-2' });
        expect(fitBounds).toHaveBeenCalledTimes(1);

        // fitBounds(bounds, options) — the first argument is [[swLng, swLat], [neLng, neLat]].
        const [[swLng], [neLng]] = fitBounds.mock.calls[0][0] as [[number, number], [number, number]];
        expect(swLng).toBeLessThan(0);   // New York, not Paris
        expect(neLng).toBeLessThan(0);
    });
});
