import { describe, it, expect } from 'vitest';
import { VIEWER_CURRENCY_COOKIE, chargeCurrencyFor, defaultChargeCurrency, readViewerCurrency } from './currency';

describe('readViewerCurrency', () => {
    it('prefers the URL over the cookie, since a link names what it was shared in', () => {
        expect(readViewerCurrency({ param: 'PHP', cookie: 'KRW' })).toBe('PHP');
        expect(readViewerCurrency({ param: undefined, cookie: 'KRW' })).toBe('KRW');
    });

    it('is case-insensitive and takes the first of a repeated param', () => {
        expect(readViewerCurrency({ param: 'usd' })).toBe('USD');
        expect(readViewerCurrency({ param: ['krw', 'php'] })).toBe('KRW');
    });

    it('ignores a value that is not a charge currency, falling through to the next', () => {
        expect(readViewerCurrency({ param: 'THB', cookie: 'KRW' })).toBe('KRW');
        expect(readViewerCurrency({ param: '<script>', cookie: 'nope' })).toBeNull();
        expect(readViewerCurrency({})).toBeNull();
    });

    it('names the cookie once, for the writer and the readers', () => {
        expect(VIEWER_CURRENCY_COOKIE).toBe('cg_currency');
    });
});

describe('defaultChargeCurrency', () => {
    it('keeps the course currency when customers can be charged in it', () => {
        expect(defaultChargeCurrency('PHP')).toBe('PHP');
        expect(defaultChargeCurrency('krw')).toBe('KRW');
    });

    it('falls back to USD for a course priced in anything else', () => {
        expect(defaultChargeCurrency('THB')).toBe('USD');
    });
});

describe('chargeCurrencyFor', () => {
    it('is the viewer\'s choice when they have one', () => {
        expect(chargeCurrencyFor('KRW', 'PHP')).toBe('KRW');
    });

    it('is the course default when they have not chosen yet', () => {
        expect(chargeCurrencyFor(null, 'PHP')).toBe('PHP');
        expect(chargeCurrencyFor(null, 'THB')).toBe('USD');
    });
});
