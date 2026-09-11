import { describe, it, expect } from 'vitest';
import type { FlightSegmentDetail } from '@/types/flights';
import { fallbackTerminal, segmentTerminal } from './terminal-fallback';

describe('fallbackTerminal', () => {
    it('gives Korean Air its home terminal at Incheon', () => {
        expect(fallbackTerminal('ICN', 'KE')).toBe('2');
    });

    it("gives every Korean Air Group carrier KE's Incheon terminal", () => {
        // Asiana and its regional units (Jin Air, Air Busan, Air Seoul) sit at T2
        // alongside Korean Air now that the group has consolidated there.
        expect(fallbackTerminal('ICN', 'OZ')).toBe('2');
        expect(fallbackTerminal('ICN', 'LJ')).toBe('2');
        expect(fallbackTerminal('ICN', 'BX')).toBe('2');
        expect(fallbackTerminal('ICN', 'RS')).toBe('2');
    });

    it('sends an independent Korean carrier with no explicit Incheon entry to Terminal 1', () => {
        // Jeju Air and T'way are not part of the Korean Air Group and stay in T1.
        expect(fallbackTerminal('ICN', '7C')).toBe('1');
        expect(fallbackTerminal('ICN', 'TW')).toBe('1');
    });

    it('splits Philippine Airlines by whether the flight is domestic or international', () => {
        // PAL's domestic flights sit at Terminal 2; its international flights sit at
        // Terminal 1 — a single value would be wrong for whichever half it missed.
        expect(fallbackTerminal('MNL', 'PR', true)).toBe('2');
        expect(fallbackTerminal('MNL', 'PR', false)).toBe('1');
    });

    it('splits AirAsia Philippines the same way', () => {
        // Domestic stays at T2; international moved to T1 (from T3).
        expect(fallbackTerminal('MNL', 'Z2', true)).toBe('2');
        expect(fallbackTerminal('MNL', 'Z2', false)).toBe('1');
    });

    it('does not guess for a split carrier when domestic/international is unknown', () => {
        // Better to say nothing than to hand back the wrong half of a split assignment.
        expect(fallbackTerminal('MNL', 'PR')).toBeUndefined();
        expect(fallbackTerminal('MNL', 'Z2')).toBeUndefined();
    });

    it('keeps Cebu Pacific in Terminal 3 regardless of flight type', () => {
        expect(fallbackTerminal('MNL', '5J', true)).toBe('3');
        expect(fallbackTerminal('MNL', '5J', false)).toBe('3');
    });

    it('refuses to guess a Manila terminal for a carrier it has no entry for', () => {
        // T1/T2/T3 all carry real traffic there — there is no safe default.
        expect(fallbackTerminal('MNL', 'KE')).toBeUndefined();
    });

    it('returns nothing for an airport Duffel already covers', () => {
        expect(fallbackTerminal('LHR', 'BA')).toBeUndefined();
        expect(fallbackTerminal('JFK', 'AA')).toBeUndefined();
    });

    it('is case-insensitive on both airport and airline', () => {
        expect(fallbackTerminal('icn', 'ke')).toBe('2');
        expect(fallbackTerminal('mnl', 'pr', true)).toBe('2');
    });

    it('handles a missing airline code without throwing', () => {
        // An airport with a default still answers; one without stays quiet.
        expect(fallbackTerminal('ICN', undefined)).toBe('1');
        expect(fallbackTerminal('MNL', undefined)).toBeUndefined();
    });
});

function seg(overrides: Partial<FlightSegmentDetail> = {}): FlightSegmentDetail {
    return {
        segmentIndex: 0,
        airline: { code: 'KE', name: 'Korean Air' },
        origin: 'ICN',
        destination: 'MNL',
        flightNumber: 'KE621',
        departure: { airport: 'ICN', time: '2026-09-23T20:00:00' },
        arrival: { airport: 'MNL', time: '2026-09-24T00:00:00' },
        duration: 240,
        stops: 0,
        cabinClass: 'economy',
        ...overrides,
    };
}

describe('segmentTerminal', () => {
    it("uses the airline's confirmed terminal when the provider gave one", () => {
        const s = seg({ departure: { airport: 'ICN', terminal: '1', time: 't' } });
        // Even though the fallback would say T2 for KE at ICN, the real value wins.
        expect(segmentTerminal(s, 'departure')).toBe('1');
    });

    it('falls back to the standing terminal when the provider gave none', () => {
        expect(segmentTerminal(seg(), 'departure')).toBe('2'); // KE at ICN
    });

    it('resolves the arrival end against the destination airport', () => {
        // KE arriving into Manila is a foreign carrier — no MNL entry, no guess.
        expect(segmentTerminal(seg(), 'arrival')).toBeUndefined();
    });

    it('reads the terminal of the airline actually operating the metal', () => {
        // Marketed by Cebu Pacific, flown by PAL on this leg — the operating carrier
        // decides where you physically are, not 5J's own Terminal 3.
        const codeshare = seg({
            origin: 'MNL',
            destination: 'ICN',
            departure: { airport: 'MNL', time: 't' },
            arrival: { airport: 'ICN', time: 't' },
            airline: { code: '5J', name: 'Cebu Pacific' },
            operatingAirline: { code: 'PR', name: 'Philippine Airlines', flightNumber: 'PR400' },
        });
        // MNL → ICN is international, so this is PR's Terminal 1, not its domestic T2.
        expect(segmentTerminal(codeshare, 'departure')).toBe('1');
    });

    it("resolves a split carrier's terminal from the segment's own route, not a fixed value", () => {
        const domesticPAL = seg({
            airline: { code: 'PR', name: 'Philippine Airlines' },
            origin: 'MNL',
            destination: 'CEB',
            departure: { airport: 'MNL', time: 't' },
            arrival: { airport: 'CEB', time: 't' },
        });
        const internationalPAL = seg({
            airline: { code: 'PR', name: 'Philippine Airlines' },
            origin: 'MNL',
            destination: 'NRT',
            departure: { airport: 'MNL', time: 't' },
            arrival: { airport: 'NRT', time: 't' },
        });

        expect(segmentTerminal(domesticPAL, 'departure')).toBe('2');
        expect(segmentTerminal(internationalPAL, 'departure')).toBe('1');
    });
});
