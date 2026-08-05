import { describe, it, expect } from 'vitest';
import { searchAirports, getAirportByCode, getAirportAlternatives } from '@/lib/airports';
import { AIRPORT_INFO } from '@/utils/airport-info';
import en from '@/locales/en.json';
import ja from '@/locales/ja.json';
import cn from '@/locales/cn.json';
import ko from '@/locales/ko.json';

/**
 * Seoul→Jeju regression: "Seoul" used to resolve to ICN, which has almost no
 * domestic Jeju service — the search returned a single placeholder offer while
 * the real flights depart Gimpo. City names must resolve to the metropolitan
 * code so the provider searches every airport in the city.
 */
describe('metropolitan code resolution', () => {
    it('ranks the city-wide code above individual airports for a city name', () => {
        expect(searchAirports('seoul', 1)[0].iata).toBe('SEL');
        expect(searchAirports('tokyo', 1)[0].iata).toBe('TYO');
        expect(searchAirports('london', 1)[0].iata).toBe('LON');
        expect(searchAirports('new york', 1)[0].iata).toBe('NYC');
        expect(searchAirports('paris', 1)[0].iata).toBe('PAR');
        expect(searchAirports('osaka', 1)[0].iata).toBe('OSA');
        expect(searchAirports('beijing', 1)[0].iata).toBe('BJS');
    });

    it('still resolves an explicit airport code to that airport', () => {
        for (const code of ['ICN', 'GMP', 'NRT', 'HND', 'LHR', 'JFK', 'CDG', 'CJU']) {
            expect(searchAirports(code, 1)[0].iata).toBe(code);
        }
    });

    it('keeps the individual airports selectable alongside the city code', () => {
        const seoul = searchAirports('seoul', 8).map(a => a.iata);
        expect(seoul).toEqual(['SEL', 'ICN', 'GMP']);
    });

    it('does not shadow single-airport cities', () => {
        expect(searchAirports('jeju', 1)[0].iata).toBe('CJU');
        expect(searchAirports('busan', 1)[0].iata).toBe('PUS');
        expect(searchAirports('singapore', 1)[0].iata).toBe('SIN');
    });

    it('flags metro entries and exposes them by code', () => {
        expect(getAirportByCode('SEL')?.isMetro).toBe(true);
        expect(getAirportByCode('ICN')?.isMetro).toBeUndefined();
        expect(searchAirports('seoul', 1)[0].isMetro).toBe(true);
    });

    it('has a city label for every metro code', () => {
        for (const code of ['SEL', 'TYO', 'OSA', 'BJS', 'NYC', 'LON', 'PAR']) {
            expect(AIRPORT_INFO[code], `${code} missing from AIRPORT_INFO`).toBeDefined();
        }
    });
});

/**
 * An empty result on one airport says nothing about its neighbours — ICN→CJU
 * returns zero while GMP→CJU returns 40+ — so a dead end must offer the rest of
 * the city rather than a bare "no flights found".
 */
describe('alternative airport suggestions', () => {
    it('suggests the sibling airport and the city-wide code', () => {
        const alt = getAirportAlternatives('ICN');
        expect(alt).not.toBeNull();
        expect(alt!.siblings.map(s => s.iata)).toEqual(['GMP']);
        expect(alt!.metro?.iata).toBe('SEL');
    });

    it('covers every multi-airport city in the dataset', () => {
        const cases: Record<string, string[]> = {
            GMP: ['ICN'], NRT: ['HND'], HND: ['NRT'], KIX: ['ITM'],
            PEK: ['PKX'], PVG: ['SHA'], BKK: ['DMK'], DMK: ['BKK'],
            IST: ['SAW'], JFK: ['LGA'], CDG: ['ORY'],
        };
        for (const [code, expected] of Object.entries(cases)) {
            const alt = getAirportAlternatives(code);
            expect(alt, `${code} should have alternatives`).not.toBeNull();
            expect(alt!.siblings.map(s => s.iata).sort()).toEqual(expected.sort());
        }
        expect(getAirportAlternatives('LHR')!.siblings.map(s => s.iata).sort()).toEqual(['LGW', 'STN']);
    });

    it('returns null when there is nothing to suggest', () => {
        // Single-airport cities — including the one that started this.
        for (const code of ['CJU', 'PUS', 'SIN', 'DPS']) {
            expect(getAirportAlternatives(code), `${code} should have no alternatives`).toBeNull();
        }
        // A city-wide code already covers the whole city.
        expect(getAirportAlternatives('SEL')).toBeNull();
        // Unknown code.
        expect(getAirportAlternatives('ZZZ')).toBeNull();
    });

    it('never suggests the searched airport back to itself', () => {
        for (const code of ['ICN', 'GMP', 'LHR', 'JFK', 'CDG', 'BKK']) {
            const alt = getAirportAlternatives(code)!;
            expect(alt.siblings.map(s => s.iata)).not.toContain(code);
        }
    });

    it('has the suggestion copy in every locale', () => {
        const keys = ['altAirportsTitle', 'altAirportsBody', 'altAirportsCta', 'altAirportsCtaSingle'];
        for (const [name, bundle] of Object.entries({ en, ja, cn, ko })) {
            for (const key of keys) {
                const value = (bundle as any).flights.search[key];
                expect(value, `${name}.flights.search.${key} missing`).toBeTruthy();
            }
            // The body names the city and the alternatives; the CTA names the city.
            expect((bundle as any).flights.search.altAirportsBody).toContain('{city}');
            expect((bundle as any).flights.search.altAirportsBody).toContain('{alternatives}');
            expect((bundle as any).flights.search.altAirportsCta).toContain('{city}');
            expect((bundle as any).flights.search.altAirportsCtaSingle).toContain('{airport}');
        }
    });
});
