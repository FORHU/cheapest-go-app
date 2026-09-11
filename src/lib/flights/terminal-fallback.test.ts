import { describe, it, expect } from 'vitest';
import type { FlightSegmentDetail } from '@/types/flights';
import { fallbackTerminal, segmentTerminal } from './terminal-fallback';

describe('fallbackTerminal', () => {
    it('gives Korean Air its home terminal at Incheon', () => {
        expect(fallbackTerminal('ICN', 'KE')).toBe('2');
    });

    it('sends a carrier with no explicit Incheon entry to Terminal 1', () => {
        // Asiana, Star Alliance, and every Korean LCC bar none sit in T1.
        expect(fallbackTerminal('ICN', 'OZ')).toBe('1');
        expect(fallbackTerminal('ICN', '7C')).toBe('1');
    });

    it('knows Philippine Airlines owns Terminal 2 at Manila and Cebu Pacific is in 3', () => {
        expect(fallbackTerminal('MNL', 'PR')).toBe('2');
        expect(fallbackTerminal('MNL', '5J')).toBe('3');
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
        // Marketed by Korean Air, flown by a partner that lives in Manila T1-only
        // territory — the operating carrier decides where you physically are.
        const codeshare = seg({
            origin: 'MNL',
            destination: 'ICN',
            departure: { airport: 'MNL', time: 't' },
            arrival: { airport: 'ICN', time: 't' },
            airline: { code: '5J', name: 'Cebu Pacific' },
            operatingAirline: { code: 'PR', name: 'Philippine Airlines', flightNumber: 'PR400' },
        });
        expect(segmentTerminal(codeshare, 'departure')).toBe('2'); // PR at MNL, not 5J's T3
    });
});
