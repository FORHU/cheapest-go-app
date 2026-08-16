import { describe, it, expect, vi } from 'vitest';
import { resolveHotelChargeBase, type StoredQuote } from './hotelChargeBase';

const HOUR = 3600_000;
const NOW = Date.UTC(2026, 7, 16, 12, 0, 0);

function quote(over: Partial<StoredQuote> = {}): StoredQuote {
    return {
        gross: 5000,
        currency: 'PHP',
        expires_at: new Date(NOW + HOUR).toISOString(),
        ...over,
    };
}

/** Stand-in for convertCurrencyStrict: PHP→USD at exactly 0.02. */
const convert = (amount: number, from: string, to: string) => {
    const rates: Record<string, number> = { USD: 1, PHP: 0.02, EUR: 1.15 };
    if (!rates[from] || !rates[to]) throw new Error(`no rate ${from}->${to}`);
    return (amount * rates[from]) / rates[to];
};

describe('resolveHotelChargeBase', () => {
    it('charges from the stored quote, not the client amount', () => {
        // Client claims 100 USD; server independently derives 5000 PHP → 100 USD.
        const res = resolveHotelChargeBase(quote(), 100, 'USD', convert, NOW);
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.base).toBeCloseTo(100, 10);
        expect(res.quoteGross).toBe(5000);
        expect(res.quoteCurrency).toBe('PHP');
    });

    it('skips conversion when the quote is already in the charge currency', () => {
        const convertSpy = vi.fn(convert);
        const res = resolveHotelChargeBase(quote(), 5000, 'PHP', convertSpy, NOW);
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.base).toBe(5000);
        expect(convertSpy).not.toHaveBeenCalled();
    });

    it('rejects a tampered low amount', () => {
        // The whole point: client says "charge me 1 USD" for a 5000 PHP room.
        const res = resolveHotelChargeBase(quote(), 1, 'USD', convert, NOW);
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe('PRICE_CHANGED');
        expect(res.serverPrice).toBe(100);
        expect(res.currency).toBe('USD');
    });

    it('rejects a tampered high amount too', () => {
        const res = resolveHotelChargeBase(quote(), 100_000, 'USD', convert, NOW);
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe('PRICE_CHANGED');
    });

    it('allows small drift inside the tolerance', () => {
        // 0.3% off — browser and server on either side of an hourly rate refresh.
        const res = resolveHotelChargeBase(quote(), 100.3, 'USD', convert, NOW);
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.drift).toBeCloseTo(0.003, 4);
    });

    it('rejects drift just outside the tolerance', () => {
        const res = resolveHotelChargeBase(quote(), 101, 'USD', convert, NOW);
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe('PRICE_CHANGED');
    });

    it('never bills above the displayed price, absorbing the difference', () => {
        // Server says 100, browser displayed 99.7 — charge the 99.7 the customer saw.
        const res = resolveHotelChargeBase(quote(), 99.7, 'USD', convert, NOW);
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.base).toBeCloseTo(99.7, 10);
        expect(res.absorbed).toBeCloseTo(0.3, 10);
    });

    it('passes on a lower price when the server figure is below the displayed one', () => {
        // Server says 100, browser displayed 100.3 — the customer gets 100, not 100.3.
        const res = resolveHotelChargeBase(quote(), 100.3, 'USD', convert, NOW);
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.base).toBeCloseTo(100, 10);
        expect(res.absorbed).toBe(0);
    });

    it('absorbs at most the tolerance, so a booking cannot be sold at a loss', () => {
        // The largest absorbable gap is bounded by the tolerance itself.
        const res = resolveHotelChargeBase(quote(), 99.51, 'USD', convert, NOW);
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.absorbed).toBeLessThanOrEqual(100 * 0.005 + 1e-9);
    });

    it('rejects a missing quote', () => {
        expect(resolveHotelChargeBase(null, 100, 'USD', convert, NOW)).toMatchObject({
            ok: false, code: 'QUOTE_NOT_FOUND',
        });
        expect(resolveHotelChargeBase(undefined, 100, 'USD', convert, NOW)).toMatchObject({
            ok: false, code: 'QUOTE_NOT_FOUND',
        });
    });

    it('rejects an expired quote', () => {
        const stale = quote({ expires_at: new Date(NOW - 1000).toISOString() });
        expect(resolveHotelChargeBase(stale, 100, 'USD', convert, NOW)).toMatchObject({
            ok: false, code: 'QUOTE_EXPIRED',
        });
    });

    it('surfaces FX failure rather than charging an unconverted amount', () => {
        const res = resolveHotelChargeBase(quote(), 100, 'XYZ', convert, NOW);
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe('FX_UNAVAILABLE');
    });

    it('rejects a non-positive or unparseable stored gross', () => {
        for (const bad of [0, -5, 'abc']) {
            expect(resolveHotelChargeBase(quote({ gross: bad as never }), 100, 'USD', convert, NOW))
                .toMatchObject({ ok: false, code: 'QUOTE_NOT_FOUND' });
        }
    });

    it('accepts a numeric string gross (postgres NUMERIC comes back as text)', () => {
        const res = resolveHotelChargeBase(quote({ gross: '5000.0000' }), 100, 'USD', convert, NOW);
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.base).toBeCloseTo(100, 10);
    });

    it('is case-insensitive about currency codes', () => {
        const res = resolveHotelChargeBase(quote({ currency: 'php' }), 100, 'usd', convert, NOW);
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.quoteCurrency).toBe('PHP');
        expect(res.currency).toBe('USD');
    });
});
