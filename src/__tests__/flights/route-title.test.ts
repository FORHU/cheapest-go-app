import { describe, it, expect } from 'vitest';
import { createTranslator } from 'next-intl';
import en from '@/locales/en.json';
import { airportLabel } from '@/lib/flights/airport-label';

/**
 * The search page names the route in full — "Clark International Airport (CRK) to
 * Heathrow Airport (LHR)" — rather than as two bare codes with an arrow between them.
 */

describe('airportLabel', () => {
    it('names an airport in full with its code', () => {
        expect(airportLabel('CRK')).toBe('Clark International Airport (CRK)');
    });

    it('reads a lower-case code the same way', () => {
        expect(airportLabel('lhr')).toBe('Heathrow Airport (LHR)');
    });

    it('falls back to the code alone for an airport it does not know', () => {
        expect(airportLabel('ZZZ')).toBe('ZZZ');
    });

    it('returns an empty label for no code', () => {
        expect(airportLabel('')).toBe('');
        expect(airportLabel(undefined)).toBe('');
    });
});

describe('the route title', () => {
    it('reads "<origin> to <destination>" with both airports named', () => {
        const t = createTranslator({ locale: 'en', messages: en as never, namespace: 'flights.search' });
        expect(t('routeTitle', { origin: airportLabel('CRK'), destination: airportLabel('LHR') }))
            .toBe('Clark International Airport (CRK) to Heathrow Airport (LHR)');
    });
});
