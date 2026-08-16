import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
    EXCHANGE_RATES,
    convertCurrency,
    convertCurrencyStrict,
    refreshExchangeRates,
    getCurrencySymbol,
    ratesAreStatic,
    ExchangeRateError,
    __resetExchangeRates,
} from './currency';

describe('currency', () => {
    beforeEach(() => {
        __resetExchangeRates();
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    describe('convertCurrency (display path)', () => {
        it('returns the amount unchanged for identical currencies', () => {
            expect(convertCurrency(100, 'USD', 'USD')).toBe(100);
            expect(convertCurrency(100, 'php', 'PHP')).toBe(100);
        });

        it('converts via USD in both directions', () => {
            const usd = convertCurrency(1000, 'PHP', 'USD');
            expect(usd).toBeCloseTo(1000 * EXCHANGE_RATES.PHP, 6);

            const back = convertCurrency(usd, 'USD', 'PHP');
            expect(back).toBeCloseTo(1000, 6);
        });

        it('is case-insensitive', () => {
            expect(convertCurrency(50, 'php', 'usd')).toBeCloseTo(convertCurrency(50, 'PHP', 'USD'), 10);
        });

        it('falls back to the original amount on an unknown currency', () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => { });
            expect(convertCurrency(100, 'PHP', 'XYZ')).toBe(100);
            expect(warn).toHaveBeenCalled();
        });
    });

    describe('convertCurrencyStrict (money path)', () => {
        it('throws when rates have never been refreshed', () => {
            expect(ratesAreStatic()).toBe(true);
            expect(() => convertCurrencyStrict(100, 'PHP', 'USD')).toThrow(ExchangeRateError);
        });

        it('still allows a same-currency no-op without live rates', () => {
            expect(convertCurrencyStrict(100, 'USD', 'USD')).toBe(100);
        });

        it('converts once rates are fresh', async () => {
            vi.stubGlobal('window', {} as unknown as Window);
            vi.stubGlobal('fetch', vi.fn(async () => ({
                ok: true,
                json: async () => ({ success: true, rates: { USD: 1, PHP: 0.02 } }),
            })) as unknown as typeof fetch);

            await refreshExchangeRates(true);

            expect(ratesAreStatic()).toBe(false);
            expect(convertCurrencyStrict(1000, 'PHP', 'USD')).toBeCloseTo(20, 10);
        });

        it('throws on an unknown currency rather than silently passing the amount through', async () => {
            vi.stubGlobal('window', {} as unknown as Window);
            vi.stubGlobal('fetch', vi.fn(async () => ({
                ok: true,
                json: async () => ({ success: true, rates: { USD: 1, PHP: 0.02 } }),
            })) as unknown as typeof fetch);
            await refreshExchangeRates(true);

            expect(() => convertCurrencyStrict(5800, 'PHP', 'XYZ')).toThrow(ExchangeRateError);
            // The dangerous legacy behaviour, pinned so it cannot come back: the display
            // helper passes the amount through untouched, the money helper must not.
            expect(convertCurrency(5800, 'PHP', 'XYZ')).toBe(5800);
        });

        it('rejects rates older than maxAgeMs', async () => {
            vi.stubGlobal('window', {} as unknown as Window);
            vi.stubGlobal('fetch', vi.fn(async () => ({
                ok: true,
                json: async () => ({ success: true, rates: { USD: 1, PHP: 0.02 } }),
            })) as unknown as typeof fetch);
            await refreshExchangeRates(true);

            // Anything fetched is at least 0ms old, so a 0ms tolerance must reject.
            expect(() => convertCurrencyStrict(100, 'PHP', 'USD', -1)).toThrow(/refusing to convert/i);
        });

        it('rejects non-finite amounts', async () => {
            vi.stubGlobal('window', {} as unknown as Window);
            vi.stubGlobal('fetch', vi.fn(async () => ({
                ok: true,
                json: async () => ({ success: true, rates: { USD: 1, PHP: 0.02 } }),
            })) as unknown as typeof fetch);
            await refreshExchangeRates(true);

            expect(() => convertCurrencyStrict(NaN, 'PHP', 'USD')).toThrow(ExchangeRateError);
        });
    });

    describe('refreshExchangeRates', () => {
        it('skips when rates are still fresh, and honours force', async () => {
            vi.stubGlobal('window', {} as unknown as Window);
            const fetchMock = vi.fn(async () => ({
                ok: true,
                json: async () => ({ success: true, rates: { USD: 1, PHP: 0.02 } }),
            }));
            vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

            expect(await refreshExchangeRates()).toBe(true);
            expect(await refreshExchangeRates()).toBe(false); // cached
            expect(fetchMock).toHaveBeenCalledTimes(1);

            expect(await refreshExchangeRates(true)).toBe(true);
            expect(fetchMock).toHaveBeenCalledTimes(2);
        });

        it('keeps previous rates when the endpoint fails', async () => {
            vi.stubGlobal('window', {} as unknown as Window);
            vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }) as unknown as typeof fetch);

            const before = EXCHANGE_RATES.PHP;
            expect(await refreshExchangeRates(true)).toBe(false);
            expect(EXCHANGE_RATES.PHP).toBe(before);
        });

        it('ignores malformed rate values', async () => {
            vi.stubGlobal('window', {} as unknown as Window);
            vi.stubGlobal('fetch', vi.fn(async () => ({
                ok: true,
                json: async () => ({ success: true, rates: { USD: 1, PHP: 0.02, KRW: 0, JPY: -1, EUR: 'nope' } }),
            })) as unknown as typeof fetch);

            const krwBefore = EXCHANGE_RATES.KRW;
            const jpyBefore = EXCHANGE_RATES.JPY;
            const eurBefore = EXCHANGE_RATES.EUR;

            await refreshExchangeRates(true);

            expect(EXCHANGE_RATES.PHP).toBe(0.02);
            expect(EXCHANGE_RATES.KRW).toBe(krwBefore);
            expect(EXCHANGE_RATES.JPY).toBe(jpyBefore);
            expect(EXCHANGE_RATES.EUR).toBe(eurBefore);
        });

        it('de-dupes concurrent refreshes', async () => {
            vi.stubGlobal('window', {} as unknown as Window);
            const fetchMock = vi.fn(async () => ({
                ok: true,
                json: async () => ({ success: true, rates: { USD: 1, PHP: 0.02 } }),
            }));
            vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

            await Promise.all([
                refreshExchangeRates(true),
                refreshExchangeRates(true),
                refreshExchangeRates(true),
            ]);

            expect(fetchMock).toHaveBeenCalledTimes(1);
        });
    });

    describe('static fallback table', () => {
        it('covers every currency the picker offers', () => {
            const expected = ['USD', 'PHP', 'KRW', 'JPY', 'EUR', 'GBP', 'AUD', 'SGD',
                'MYR', 'THB', 'VND', 'IDR', 'CNY', 'TWD', 'HKD', 'INR', 'AED', 'CAD'];
            for (const code of expected) {
                expect(EXCHANGE_RATES[code], `missing rate for ${code}`).toBeGreaterThan(0);
            }
        });
    });

    describe('getCurrencySymbol', () => {
        it('maps known currencies and falls back to the code', () => {
            expect(getCurrencySymbol('USD')).toBe('$');
            expect(getCurrencySymbol('php')).toBe('₱');
            expect(getCurrencySymbol('VND')).toBe('₫');
            expect(getCurrencySymbol('ZZZ')).toBe('ZZZ');
        });
    });
});
