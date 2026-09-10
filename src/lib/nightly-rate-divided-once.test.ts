import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { nightsBetween } from './perNightPrice';

/**
 * A search price is divided by the night count exactly once.
 *
 * `/api/search/stream` divides the supplier's Stay Total before putting a price on the
 * wire. Seven display surfaces divided again, so every multi-night search advertised half
 * the real rate: ₱1,587 on the map for a room the property page sold at ₱3,173, on a
 * two-night stay. It was invisible on one-night searches, because the server's division is
 * guarded by `nights > 1` and halving by one changes nothing.
 *
 * Nothing here can be caught by types — both values are numbers and both divisions are
 * correct in isolation. What is checkable is that only one of them exists, so these read
 * the source. Coarse on purpose: the failure was a second correct-looking line, not a
 * wrong one.
 */

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

/** Every surface that renders a price from the search stream. */
const DISPLAY_SURFACES = [
    'src/components/shared/PropertyCard/PropertyCard.tsx',
    'src/components/map/MapPopup.tsx',
    'src/components/map/MapPropertyCard.tsx',
    'src/components/map/PropertyMapView.tsx',
    'src/components/mapbox/SearchMapContainer.tsx',
    'src/components/mapbox/components/SelectedPropertyPopup.tsx',
    'src/components/search/SearchListWithMap.tsx',
];

describe('a search price is divided by nights exactly once', () => {
    it('divides on the server, where the price is put on the wire', () => {
        const source = read('src/app/api/search/stream/route.ts');
        expect(source).toMatch(/price:\s*\(h\.price \?\? 0\) \/ Math\.max\(1, nights\)/);
    });

    it('does not round before the currency is known', () => {
        // Cheap today and not in principle: OTV answers in PHP whatever we ask for, so the
        // old rounding cost about ₱1 in ₱1,600. It rounded in a unit the supplier chose,
        // though — the same line against a supplier answering in USD would discard real
        // money before the viewer's currency is known. The display rounds, where it can see
        // what one unit is worth to the person reading it.
        const source = read('src/app/api/search/stream/route.ts');
        const line = source.split('\n').find(l => l.includes('price: (h.price ?? 0)')) ?? '';
        expect(line).not.toMatch(/Math\.round/);
    });

    it('does not divide again on any display surface', () => {
        for (const file of DISPLAY_SURFACES) {
            const source = read(file);
            // The two shapes the second division took.
            expect(source, `${file} divides a converted price by nights`)
                .not.toMatch(/convertCurrency\([^)]*\)\s*\/\s*nights/);
            expect(source, `${file} still calls toPerNight`).not.toMatch(/toPerNight\s*\(/);
        }
    });

    it('offers no helper whose name invites the second division', () => {
        // `toPerNight` was deleted rather than left unused. A helper called "to per night"
        // reads as safe to apply to a price that is already per night, and dividing twice
        // is silent — which is how this returned after being fixed once already.
        expect(read('src/lib/perNightPrice.ts')).not.toMatch(/export function toPerNight/);
    });

    it('counts the nights the way both sides of the wire count them', () => {
        // The server derives nights from the same checkin/checkout the client does. If these
        // ever disagreed, one side would divide by a different number and the halving would
        // come back as a subtler ratio.
        expect(nightsBetween(new Date('2026-09-15'), new Date('2026-09-17'))).toBe(2);
        expect(nightsBetween(new Date('2026-09-15'), new Date('2026-09-16'))).toBe(1);
        // Unset dates mean one night, never zero — a divisor of zero would render Infinity.
        expect(nightsBetween(null, null)).toBe(1);
        expect(nightsBetween(new Date('2026-09-17'), new Date('2026-09-15'))).toBe(1);
    });

    it('reproduces the reported figures', () => {
        // Quest Plus Filinvest City Manila, 15–17 Sep, 2 nights. The supplier's stay total
        // divided once is what the property page sold; divided twice is what the map showed.
        const stayTotal = 6346;
        const nights = 2;
        const correct = stayTotal / nights;
        const doubled = correct / nights;

        expect(correct).toBe(3173);
        expect(Math.round(doubled)).toBe(1587);
    });
});
