import { describe, it, expect, vi } from 'vitest';
import { applyMarkup, golfServiceFee, GOLF_MARKUP_SPEC, roundToCurrency, toStripeAmount } from './pricing';

const same = (amount: number) => amount;

describe('roundToCurrency', () => {
    it('keeps cents where a currency has them', () => {
        expect(roundToCurrency(10.005, 'USD')).toBe(10.01);
        expect(roundToCurrency(1234.567, 'php')).toBe(1234.57);
    });

    it('rounds to whole units where it has none, so shown and charged agree', () => {
        expect(roundToCurrency(123456.78, 'KRW')).toBe(123457);
        expect(roundToCurrency(123456.4, 'krw')).toBe(123456);
        // The amount Stripe is sent is the amount that was shown.
        expect(toStripeAmount(roundToCurrency(123456.78, 'KRW'), 'KRW')).toBe(123457);
    });
});

describe('golfServiceFee', () => {
    it('follows the hotel numbers, as configured, until golf has its own', async () => {
        vi.resetModules();
        vi.stubEnv('HOTEL_MARKUP_PERCENTAGE', '0.05');
        vi.stubEnv('HOTEL_MARKUP_FLAT_USD', '0.30');
        vi.stubEnv('GOLF_MARKUP_PERCENTAGE', undefined);
        vi.stubEnv('GOLF_MARKUP_FLAT_USD', undefined);
        try {
            const pricing = await import('./pricing');
            expect(pricing.GOLF_MARKUP_SPEC).toMatchObject({ rate: 0.05, flat: 0.30 });
        } finally {
            vi.unstubAllEnvs();
        }
    });

    it('applies the golf spec, flat part included', () => {
        const expected = applyMarkup(200, GOLF_MARKUP_SPEC, GOLF_MARKUP_SPEC.flat);
        const fee = golfServiceFee(200, 'USD', same);
        expect(fee.chargedTotal).toBe(expected.chargedPrice);
        expect(fee.serviceFee).toBe(expected.markupAmount);
    });

    it('drops the flat part rather than refuse when it cannot be converted', () => {
        const fee = golfServiceFee(5000, 'PHP', () => { throw new Error('no rate'); });
        expect(fee.markupFlat).toBe(0);
        expect(fee.chargedTotal).toBeGreaterThan(5000);
    });
});
