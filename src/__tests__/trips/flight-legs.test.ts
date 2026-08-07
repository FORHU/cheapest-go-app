import { describe, it, expect } from 'vitest';
import { splitFlightLegs, stopsInLeg, type LegSegment } from '@/lib/trips/flight-legs';

const seg = (
    origin: string, destination: string, departure: string, arrival: string, itinerary_index = 0,
): LegSegment => ({ origin, destination, departure, arrival, itinerary_index });

// The exact shape of the booking in the user's screenshot, read from the DB:
// both rows carry itinerary_index=0, so the split must be derived.
const GMP_CJU_ROUND_TRIP = [
    seg('GMP', 'CJU', '2026-08-26T19:21:00', '2026-08-26T20:32:00'),
    seg('CJU', 'GMP', '2026-08-28T22:27:00', '2026-08-28T23:38:00'),
];

describe('splitFlightLegs', () => {
    it('splits a round trip whose itinerary_index is uniformly 0', () => {
        const legs = splitFlightLegs(GMP_CJU_ROUND_TRIP, 'round-trip');
        expect(legs).toHaveLength(2);
        expect(legs[0][0].origin).toBe('GMP');
        expect(legs[0][0].destination).toBe('CJU');
        expect(legs[1][0].origin).toBe('CJU');
        expect(legs[1][0].destination).toBe('GMP');
    });

    it('reports each leg nonstop — not "1 stop" for the pair', () => {
        const legs = splitFlightLegs(GMP_CJU_ROUND_TRIP, 'round-trip');
        expect(legs.map(stopsInLeg)).toEqual([0, 0]);
    });

    it('puts a connection in the outbound and keeps the return separate', () => {
        // GMP →(2h connection)→ ICN → CJU, then a 2-day stay, then CJU → GMP.
        const legs = splitFlightLegs([
            seg('GMP', 'ICN', '2026-08-26T08:00:00', '2026-08-26T09:00:00'),
            seg('ICN', 'CJU', '2026-08-26T11:00:00', '2026-08-26T12:10:00'),
            seg('CJU', 'GMP', '2026-08-28T18:00:00', '2026-08-28T19:10:00'),
        ], 'round-trip');
        expect(legs).toHaveLength(2);
        expect(legs[0]).toHaveLength(2);
        expect(legs[1]).toHaveLength(1);
        expect(legs.map(stopsInLeg)).toEqual([1, 0]);
    });

    it('trusts itinerary_index when it actually varies', () => {
        const legs = splitFlightLegs([
            seg('GMP', 'ICN', '2026-08-26T08:00:00', '2026-08-26T09:00:00', 0),
            seg('ICN', 'CJU', '2026-08-26T11:00:00', '2026-08-26T12:10:00', 0),
            seg('CJU', 'GMP', '2026-08-28T18:00:00', '2026-08-28T19:10:00', 1),
        ]);
        expect(legs.map(l => l.length)).toEqual([2, 1]);
    });

    it('keeps a one-way with a long layover as a single leg', () => {
        // A 30-hour layover must not be read as a return that does not exist.
        const legs = splitFlightLegs([
            seg('CRK', 'HKG', '2026-09-10T10:45:00', '2026-09-10T12:55:00'),
            seg('HKG', 'KUL', '2026-09-11T19:00:00', '2026-09-11T23:00:00'),
        ], 'one-way');
        expect(legs).toHaveLength(1);
        expect(stopsInLeg(legs[0])).toBe(1);
    });

    it('handles a single-segment one-way', () => {
        const legs = splitFlightLegs([seg('GMP', 'CJU', '2026-08-26T19:21:00', '2026-08-26T20:32:00')], 'one-way');
        expect(legs).toHaveLength(1);
        expect(stopsInLeg(legs[0])).toBe(0);
    });

    it('detects a round trip from the route when trip_type is absent', () => {
        const legs = splitFlightLegs(GMP_CJU_ROUND_TRIP, null);
        expect(legs).toHaveLength(2);
    });

    it('returns nothing for an empty or missing segment list', () => {
        expect(splitFlightLegs([], 'round-trip')).toEqual([]);
        expect(splitFlightLegs(null, 'round-trip')).toEqual([]);
        expect(splitFlightLegs(undefined, 'round-trip')).toEqual([]);
    });

    it('does not crash on unparseable timestamps', () => {
        const legs = splitFlightLegs([
            seg('GMP', 'CJU', 'not-a-date', 'also-not-a-date'),
            seg('CJU', 'GMP', 'nope', 'nope'),
        ], 'round-trip');
        expect(legs).toHaveLength(2);
    });
});
