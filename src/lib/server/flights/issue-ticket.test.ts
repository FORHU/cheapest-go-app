import { describe, it, expect } from 'vitest';
import { buildSeatMap } from './issue-ticket';

const pax = (id: string, seat?: string) => ({
    passenger_id: id,
    ...(seat ? { seat: { designator: seat } } : {}),
});

const order = (slices: any[], passengers: { id: string }[] = []) => ({ slices, passengers });

const seg = (...passengers: any[]) => ({ passengers });
const slice = (...segs: any[]) => ({ segments: segs });

describe('buildSeatMap', () => {
    it('returns an empty map when the airline assigns no seats', () => {
        const o = order([slice(seg(pax('pas_1')))]);
        expect(buildSeatMap(o).size).toBe(0);
    });

    it('maps a single passenger seat on a direct flight', () => {
        const o = order([slice(seg(pax('pas_1', '14A')))]);
        expect(buildSeatMap(o).get('pas_1')).toBe('14A');
    });

    it('joins outbound and return seats with " / " for a round trip', () => {
        const o = order([
            slice(seg(pax('pas_1', '14A'))),
            slice(seg(pax('pas_1', '22C'))),
        ]);
        expect(buildSeatMap(o).get('pas_1')).toBe('14A / 22C');
    });

    it('tracks each passenger separately', () => {
        const o = order([slice(seg(pax('pas_1', '14A'), pax('pas_2', '14B')))]);
        const m = buildSeatMap(o);
        expect(m.get('pas_1')).toBe('14A');
        expect(m.get('pas_2')).toBe('14B');
    });

    it('skips segments where the seat field is absent', () => {
        const o = order([
            slice(seg(pax('pas_1', '14A'))),
            slice(seg(pax('pas_1'))),          // no seat on return leg
        ]);
        expect(buildSeatMap(o).get('pas_1')).toBe('14A');
    });

    it('skips entries missing a passenger_id', () => {
        const o = order([slice(seg({ seat: { designator: '14A' } }))]);
        expect(buildSeatMap(o).size).toBe(0);
    });

    it('handles a null or empty order without throwing', () => {
        expect(buildSeatMap(null).size).toBe(0);
        expect(buildSeatMap({}).size).toBe(0);
        expect(buildSeatMap({ slices: [] }).size).toBe(0);
    });
});
