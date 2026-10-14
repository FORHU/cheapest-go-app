import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/currency', () => {
    const rates: Record<string, number> = { USD: 1, PHP: 58, KRW: 1350 };
    return {
        convertCurrencyStrict: (amount: number, from: string, to: string) => {
            const f = rates[from.toUpperCase()];
            const t = rates[to.toUpperCase()];
            if (!f || !t) throw new Error(`no rate ${from}->${to}`);
            return (amount / f) * t;
        },
    };
});

import { applyMarkup, FLIGHT_MARKUP_SPEC, toStripeAmount } from '@/lib/pricing';
import { quoteFlightCharge } from './flight-charge';

describe('quoteFlightCharge', () => {
    it('is the marked-up price when the charge currency is the supplier currency', () => {
        const expected = applyMarkup(100, FLIGHT_MARKUP_SPEC, FLIGHT_MARKUP_SPEC.flat);
        const charge = quoteFlightCharge({ baseTotal: 100, baseCurrency: 'USD', chargeCurrency: 'usd' });

        expect(charge.chargePrice).toBe(expected.chargedPrice);
        expect(charge.stripeAmount).toBe(toStripeAmount(expected.chargedPrice, 'usd'));
        expect(charge.originalPrice).toBe(100);
    });

    it('converts the marked-up price into the traveller\'s currency, in that currency\'s units', () => {
        const marked = applyMarkup(100, FLIGHT_MARKUP_SPEC, FLIGHT_MARKUP_SPEC.flat).chargedPrice;
        const charge = quoteFlightCharge({ baseTotal: 100, baseCurrency: 'USD', chargeCurrency: 'php' });

        expect(charge.chargePrice).toBe(Math.round(marked * 58 * 100) / 100);
        expect(charge.stripeAmount).toBe(Math.round(charge.chargePrice * 100));
    });

    it('uses whole units for a zero-decimal currency', () => {
        const charge = quoteFlightCharge({ baseTotal: 100, baseCurrency: 'USD', chargeCurrency: 'krw' });
        expect(Number.isInteger(charge.stripeAmount)).toBe(true);
    });

    it('converts the USD flat component into the supplier currency before adding it', () => {
        const flatInPhp = FLIGHT_MARKUP_SPEC.flat * 58;
        const expected = applyMarkup(5800, FLIGHT_MARKUP_SPEC, flatInPhp);
        const charge = quoteFlightCharge({ baseTotal: 5800, baseCurrency: 'PHP', chargeCurrency: 'php' });
        expect(charge.chargePrice).toBe(expected.chargedPrice);
    });

    it('drops the flat component rather than failing when it cannot be converted', () => {
        const expected = applyMarkup(100, FLIGHT_MARKUP_SPEC, 0);
        const charge = quoteFlightCharge({ baseTotal: 100, baseCurrency: 'XXX', chargeCurrency: 'xxx' });
        expect(charge.chargePrice).toBe(expected.chargedPrice);
    });

    it('throws when the charge currency itself cannot be converted into', () => {
        expect(() => quoteFlightCharge({ baseTotal: 100, baseCurrency: 'USD', chargeCurrency: 'xxx' })).toThrow();
    });
});
