import { describe, it, expect } from 'vitest';
import { applyMarkup, golfServiceFee, GOLF_MARKUP_SPEC } from './pricing';

const same = (amount: number) => amount;

describe('golfServiceFee', () => {
    it.skipIf(process.env.GOLF_MARKUP_PERCENTAGE !== undefined || process.env.GOLF_MARKUP_FLAT_USD !== undefined)(
        'charges the hotel numbers until golf has its own',
        () => {
            expect(GOLF_MARKUP_SPEC).toMatchObject({ rate: 0.059, flat: 0.40 });
        },
    );

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
