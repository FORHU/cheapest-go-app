import { describe, it, expect, vi } from 'vitest';
import { resolveHotelChargeBase, type StoredQuote } from './hotelChargeBase';
import { HOTEL_FX_DISPLAY_TOLERANCE as TOL } from '@/lib/pricing';

// Fixtures are derived from TOL rather than written as literals. They used to be
// sized to a hard-coded 0.5%, so measuring Stripe at 4.4% — which forced the
// tolerance down to 0.3% — broke them. INSIDE and ABSORB sit two-thirds of the
// way to the limit, clear of the boundary in either direction.
const INSIDE = 100 * (1 + TOL * 2 / 3);
const ABSORB = 100 * (1 - TOL * 2 / 3);
const AT_LIMIT = 100 * (1 - TOL * 0.97);

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
        // Inside the band — browser and server on either side of an hourly refresh.
        const res = resolveHotelChargeBase(quote(), INSIDE, 'USD', convert, NOW);
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.drift).toBeCloseTo(TOL * 2 / 3, 6);
    });

    it('rejects drift just outside the tolerance', () => {
        const res = resolveHotelChargeBase(quote(), 101, 'USD', convert, NOW);
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe('PRICE_CHANGED');
    });

    it('never bills above the displayed price, absorbing the difference', () => {
        // Server says 100, browser displayed less — charge what the customer saw.
        const res = resolveHotelChargeBase(quote(), ABSORB, 'USD', convert, NOW);
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.base).toBeCloseTo(ABSORB, 10);
        expect(res.absorbed).toBeCloseTo(100 - ABSORB, 10);
    });

    it('passes on a lower price when the server figure is below the displayed one', () => {
        // Server says 100, browser displayed more — the customer gets 100.
        const res = resolveHotelChargeBase(quote(), INSIDE, 'USD', convert, NOW);
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.base).toBeCloseTo(100, 10);
        expect(res.absorbed).toBe(0);
    });

    it('absorbs at most the tolerance, so a booking cannot be sold at a loss', () => {
        // The largest absorbable gap is bounded by the tolerance itself — which is
        // the point of the tolerance: it is sized to stay inside the hotel margin.
        const res = resolveHotelChargeBase(quote(), AT_LIMIT, 'USD', convert, NOW);
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.absorbed).toBeLessThanOrEqual(100 * TOL + 1e-9);
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
