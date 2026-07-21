/**
 * The hotel results list and the map pins are both derived from the set these
 * helpers produce, which is what keeps the marker count equal to the list count.
 */
import { describe, it, expect } from 'vitest';
import { hasValidCoords, dedupeByProximity } from '@/components/search/mappableUtils';

describe('hasValidCoords', () => {
    it('accepts real coordinates', () => {
        expect(hasValidCoords({ coordinates: { lat: 48.85, lng: 2.35 } })).toBe(true);
    });

    it('rejects missing, malformed, or (0,0) coordinates', () => {
        expect(hasValidCoords({})).toBe(false);
        expect(hasValidCoords({ coordinates: null })).toBe(false);
        expect(hasValidCoords({ coordinates: { lat: 0, lng: 0 } })).toBe(false);
        expect(hasValidCoords({ coordinates: { lat: 48.85, lng: 0 } })).toBe(false);
        expect(hasValidCoords({ coordinates: { lat: '48.85', lng: 2.35 } })).toBe(false);
        expect(hasValidCoords(null)).toBe(false);
    });
});

describe('dedupeByProximity', () => {
    const at = (id: string, lat: number, lng: number, price: number) => ({
        id,
        coordinates: { lat, lng },
        price,
    });

    it('collapses hotels within ~100m into one, keeping the cheaper', () => {
        const list = [
            at('a', 48.8600, 2.3500, 200), // supplier 1
            at('a-dup', 48.86001, 2.35001, 150), // same hotel, other supplier, cheaper
            at('b', 48.8700, 2.3600, 300), // distinct, ~1km away
        ];
        const out = dedupeByProximity(list);
        expect(out).toHaveLength(2);
        // The kept near-duplicate is the cheaper one.
        const kept = out.find((h) => Math.abs(h.coordinates.lat - 48.86) < 0.001);
        expect(kept?.price).toBe(150);
        // The distinct hotel survives.
        expect(out.some((h) => h.id === 'b')).toBe(true);
    });

    it('keeps hotels that are clearly apart', () => {
        const list = [
            at('a', 48.8600, 2.3500, 100),
            at('b', 48.8650, 2.3550, 100), // ~600m away — beyond the 100m threshold
        ];
        expect(dedupeByProximity(list)).toHaveLength(2);
    });

    it('is a no-op on an empty list', () => {
        expect(dedupeByProximity([])).toEqual([]);
    });

    it('produces a set the map can pin 1:1 (marker count = list count)', () => {
        const list = [
            at('a', 48.86, 2.35, 200),
            at('a-dup', 48.86001, 2.35001, 150),
            at('b', 48.90, 2.40, 300),
            at('c', 48.80, 2.30, 250),
        ];
        const deduped = dedupeByProximity(list);
        // Every deduped item has valid coords, so the map pins them one-for-one.
        const pins = deduped.filter(hasValidCoords);
        expect(pins).toHaveLength(deduped.length);
    });
});
