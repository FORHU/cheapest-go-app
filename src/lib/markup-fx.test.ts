import { describe, it, expect, beforeEach } from 'vitest';
import { convertCurrencyStrict, EXCHANGE_RATES, ExchangeRateError } from './currency';
import { applyMarkup, FLIGHT_MARKUP_SPEC, type MarkupSpec } from './pricing';

/**
 * The flat component of the markup is USD-denominated, because the costs it
 * recovers are: Duffel's $3.00 order fee and Stripe's $0.30. Flights apply the
 * markup in the *supplier's* currency, before the charge-currency conversion, so
 * the flat fee has to be converted first — adding 4.40 to a PHP fare charges
 * ₱4.40, about seven US cents, and under-recovers on every booking.
 *
 * The booking routes were the only place this ran, which made it look untestable
 * without a live booking. It isn't: `convertCurrencyStrict` is a pure function
 * over the in-memory EXCHANGE_RATES table, so the exact production path can be
 * exercised here — no Duffel, no OTV, no PaymentIntent. See ADR-0036.
 */

const FLIGHTS: MarkupSpec = { rate: 0.072, flat: 4.40, cap: 0.12 };

/**
 * Waives the staleness check, so these run against the static fallback table
 * instead of reaching the network.
 *
 * `convertCurrencyStrict` refuses outright when rates have never been fetched —
 * deliberately, so a provider outage fails a booking loudly rather than charging
 * against drifted numbers. The production routes satisfy it by calling
 * `refreshExchangeRates()` first; that guard is exercised on its own below.
 */
const FRESH = Infinity;

/** Restore the module-level rate table between tests that perturb it. */
const SAVED = { ...EXCHANGE_RATES };
beforeEach(() => {
    for (const k of Object.keys(EXCHANGE_RATES)) delete EXCHANGE_RATES[k];
    Object.assign(EXCHANGE_RATES, SAVED);
});

describe('the flat markup component across currencies', () => {
    it('converts USD into the supplier currency before adding it', () => {
        // Rates are USD-per-1-unit, so USD→PHP divides by the PHP rate.
        const flatPhp = convertCurrencyStrict(FLIGHTS.flat, 'usd', 'php', FRESH);
        expect(flatPhp).toBeGreaterThan(200);   // ~₱270 at ₱61/USD
        expect(flatPhp).toBeLessThan(400);

        const p = applyMarkup(30000, FLIGHTS, flatPhp);
        expect(p.markupAmount).toBeCloseTo(30000 * 0.072 + flatPhp, 2);
    });

    it('is worth ~100x more converted than taken literally, in KRW', () => {
        // The failure this guards: ₩4.40 instead of ~₩6,200.
        const flatKrw = convertCurrencyStrict(FLIGHTS.flat, 'usd', 'krw', FRESH);
        expect(flatKrw).toBeGreaterThan(1000);
        expect(flatKrw / FLIGHTS.flat).toBeGreaterThan(100);
    });

    it('is a no-op when the supplier already prices in USD', () => {
        // Duffel commonly settles USD, and convertCurrencyStrict short-circuits
        // on from === to, so the default argument is correct in that case.
        expect(convertCurrencyStrict(FLIGHTS.flat, 'usd', 'usd')).toBe(FLIGHTS.flat);
        expect(applyMarkup(500, FLIGHTS).markupFlat).toBe(4.40);
    });

    it('recovers the same real value whatever the supplier prices in', () => {
        // A $500-equivalent fare should carry a $500-equivalent markup in any
        // currency. This is the property the conversion exists to preserve.
        const usd = applyMarkup(500, FLIGHTS);
        for (const currency of ['php', 'krw']) {
            const rate = EXCHANGE_RATES[currency.toUpperCase()];
            const base = 500 / rate;
            const flat = convertCurrencyStrict(FLIGHTS.flat, 'usd', currency, FRESH);
            const local = applyMarkup(base, FLIGHTS, flat);
            expect(local.markupAmount * rate).toBeCloseTo(usd.markupAmount, 1);
        }
    });

    it('throws rather than silently passing the amount through on an unknown currency', () => {
        // The booking routes catch this and fall back to charging the proportional
        // part only. A silent passthrough would instead add 4.40 of whatever unit
        // the fare happened to be in.
        expect(() => convertCurrencyStrict(FLIGHTS.flat, 'usd', 'zzz', FRESH)).toThrow(ExchangeRateError);
    });

    it('refuses to convert against rates that never loaded', () => {
        // maxAgeMs = 0 stands in for stale rates: production passes the default,
        // and a booking route that cannot convert loses $4.40, never the PNR.
        expect(() => convertCurrencyStrict(FLIGHTS.flat, 'usd', 'php', 0)).toThrow(ExchangeRateError);
    });
});

describe('FLIGHT_MARKUP_SPEC as configured', () => {
    it('carries a flat component that is meaningless without conversion', () => {
        // A guard on the config itself: if flat is ever set to 0, the conversion
        // code above becomes dead and this suite stops proving anything.
        expect(FLIGHT_MARKUP_SPEC.flat).toBeGreaterThan(0);
    });
});
