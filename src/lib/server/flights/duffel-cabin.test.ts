import { describe, it, expect } from 'vitest';
import { normaliseCabinClass, cabinClassFromRawOffer } from './duffel-cabin';

/**
 * Regression cover for the offer auto-refresh 422:
 *   Field 'cabin_class' must be one of "economy", "premium_economy", …
 *
 * The old code lowercased `cabin_class_marketing_name` and posted it as
 * `cabin_class`. The marketing names below are the real values Duffel returned
 * for CRK→NRT on 2026-08-26.
 */
describe('normaliseCabinClass', () => {
    it('accepts every Duffel cabin_class value', () => {
        for (const v of ['economy', 'premium_economy', 'business', 'first']) {
            expect(normaliseCabinClass(v)).toBe(v);
        }
    });

    it('normalises case and separators', () => {
        expect(normaliseCabinClass('Economy')).toBe('economy');
        expect(normaliseCabinClass('  BUSINESS ')).toBe('business');
        expect(normaliseCabinClass('premium economy')).toBe('premium_economy');
        expect(normaliseCabinClass('premium-economy')).toBe('premium_economy');
    });

    it('rejects airline marketing names that are not cabin classes', () => {
        // These previously flowed straight into the request body and 422'd.
        for (const name of ['ECO', 'ECOPREMIUM', 'Economy Supersaver', 'SuperValue']) {
            expect(normaliseCabinClass(name)).toBeUndefined();
        }
    });

    it('rejects non-strings', () => {
        for (const v of [undefined, null, 42, {}, []]) {
            expect(normaliseCabinClass(v)).toBeUndefined();
        }
    });
});

describe('cabinClassFromRawOffer', () => {
    const offerWith = (cabin: unknown, marketing: unknown) => ({
        slices: [{ segments: [{ passengers: [{ cabin_class: cabin, cabin_class_marketing_name: marketing }] }] }],
    });

    it('reads the per-passenger enum, ignoring the marketing name', () => {
        // Duffel omits cabin_class at the offer root, so this is the real source.
        expect(cabinClassFromRawOffer(offerWith('economy', 'ECO'))).toBe('economy');
        expect(cabinClassFromRawOffer(offerWith('premium_economy', 'ECOPREMIUM'))).toBe('premium_economy');
        expect(cabinClassFromRawOffer(offerWith('business', 'Biz Flex'))).toBe('business');
    });

    it('never returns a marketing name even when the enum is missing', () => {
        const result = cabinClassFromRawOffer(offerWith(undefined, 'ECOPREMIUM'));
        expect(result).toBe('economy');
        expect(normaliseCabinClass(result)).toBe(result);
    });

    it('falls back to economy on malformed offers', () => {
        expect(cabinClassFromRawOffer(undefined)).toBe('economy');
        expect(cabinClassFromRawOffer({})).toBe('economy');
        expect(cabinClassFromRawOffer({ slices: [] })).toBe('economy');
    });

    it('prefers a valid root cabin_class when present', () => {
        expect(cabinClassFromRawOffer({ cabin_class: 'first', ...offerWith('economy', 'ECO') })).toBe('first');
    });
});
