import { describe, it, expect } from 'vitest';
import { priceChangeFromFailure } from './price-change-failure';

describe('priceChangeFromFailure', () => {
    it('reads the new fare out of a refusal', () => {
        expect(priceChangeFromFailure({
            errorCode: 'price_changed', priceChange: { oldPrice: 100, newPrice: 110.5, currency: 'USD' },
        })).toEqual({ oldPrice: 100, newPrice: 110.5, currency: 'USD' });
    });

    it('is null for any other failure', () => {
        expect(priceChangeFromFailure({ errorCode: 'flight_unavailable' })).toBeNull();
        expect(priceChangeFromFailure(null)).toBeNull();
        expect(priceChangeFromFailure(undefined)).toBeNull();
    });

    it('is null when the numbers are missing or not numbers, rather than prompting "NaN"', () => {
        expect(priceChangeFromFailure({ errorCode: 'price_changed' })).toBeNull();
        expect(priceChangeFromFailure({ errorCode: 'price_changed', priceChange: { oldPrice: 'x', newPrice: 1, currency: 'USD' } })).toBeNull();
        expect(priceChangeFromFailure({ errorCode: 'price_changed', priceChange: { oldPrice: 1, newPrice: 2 } })).toBeNull();
    });
});
