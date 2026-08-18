import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { getLiveRates, SUPPORTED_CURRENCIES, __resetRatesCache } from './exchange-rates';

/** Build a "1 USD = X units" payload covering every supported currency. */
function fullPayload(rate = 2) {
    const rates: Record<string, number> = {};
    for (const c of SUPPORTED_CURRENCIES) if (c !== 'USD') rates[c] = rate;
    return rates;
}

/** What Frankfurter actually returns: no VND, TWD or AED. */
function ecbPayload(rate = 4) {
    const rates = fullPayload(rate);
    delete rates.VND;
    delete rates.TWD;
    delete rates.AED;
    return rates;
}

describe('getLiveRates', () => {
    beforeEach(() => {
        __resetRatesCache();
        vi.restoreAllMocks();
        vi.spyOn(console, 'warn').mockImplementation(() => { });
        vi.spyOn(console, 'error').mockImplementation(() => { });
    });

    afterEach(() => vi.unstubAllGlobals());

    it('uses the primary provider and inverts to USD-per-unit', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true,
            json: async () => ({ rates: fullPayload(2) }),
        })) as unknown as typeof fetch);

        const res = await getLiveRates(true);
        expect(res?.provider).toBe('er-api');
        expect(res?.source).toBe('live');
        expect(res?.rates.USD).toBe(1);
        expect(res?.rates.PHP).toBeCloseTo(0.5, 10); // 1 / 2
        expect(res?.missing).toEqual([]);
    });

    it('falls back to Frankfurter when the primary fails, and reports the gap', async () => {
        const fetchMock = vi.fn(async (url: string) => {
            if (String(url).includes('er-api')) throw new Error('primary down');
            return { ok: true, json: async () => ({ rates: ecbPayload(4) }) };
        });
        vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

        const res = await getLiveRates(true);
        expect(res?.provider).toBe('frankfurter');
        expect(res?.source).toBe('live-partial');
        expect(res?.rates.PHP).toBeCloseTo(0.25, 10);
        // The exact reason Frankfurter alone was not good enough for this app.
        expect(res?.missing.sort()).toEqual(['AED', 'TWD', 'VND']);
    });

    it('caches within the TTL and re-fetches on force', async () => {
        const fetchMock = vi.fn(async () => ({
            ok: true, json: async () => ({ rates: fullPayload(2) }),
        }));
        vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

        await getLiveRates(true);
        const cachedRes = await getLiveRates();
        expect(cachedRes?.source).toBe('cache');
        expect(fetchMock).toHaveBeenCalledTimes(1);

        await getLiveRates(true);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('serves stale cache when every provider fails', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true, json: async () => ({ rates: fullPayload(2) }),
        })) as unknown as typeof fetch);
        await getLiveRates(true);

        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('all down'); }) as unknown as typeof fetch);
        const res = await getLiveRates(true);

        expect(res?.source).toBe('stale-cache');
        expect(res?.rates.PHP).toBeCloseTo(0.5, 10);
    });

    it('returns null when every provider fails with no cache', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('all down'); }) as unknown as typeof fetch);
        expect(await getLiveRates(true)).toBeNull();
    });

    it('rejects a provider that returns too few usable rates', async () => {
        // Only USD + one currency: not enough to price the app.
        const fetchMock = vi.fn(async (url: string) => {
            if (String(url).includes('er-api')) return { ok: true, json: async () => ({ rates: { PHP: 2 } }) };
            return { ok: true, json: async () => ({ rates: fullPayload(4) }) };
        });
        vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

        const res = await getLiveRates(true);
        expect(res?.provider).toBe('frankfurter');
    });

    it('discards zero, negative and non-numeric rates', async () => {
        const bad = { ...fullPayload(2), KRW: 0, JPY: -3, EUR: 'nope' as unknown as number };
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true, json: async () => ({ rates: bad }),
        })) as unknown as typeof fetch);

        const res = await getLiveRates(true);
        expect(res?.rates.KRW).toBeUndefined();
        expect(res?.rates.JPY).toBeUndefined();
        expect(res?.rates.EUR).toBeUndefined();
        expect(res?.missing.sort()).toEqual(['EUR', 'JPY', 'KRW']);
    });
});
