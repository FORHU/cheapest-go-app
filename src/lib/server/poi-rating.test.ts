import { describe, it, expect } from 'vitest';
import { withoutInventedRating } from './poi-rating';

describe('withoutInventedRating', () => {
    it('removes a rating that was invented, and what came with it', () => {
        expect(withoutInventedRating({ name: 'Rest Garden', rating: 4.371829, userRatingsTotal: 312, vicinity: 'Recommended Local Spot', source: 'mock-fallback' }))
            .toEqual({ name: 'Rest Garden', rating: null, userRatingsTotal: null, vicinity: null, source: 'none' });
    });

    it('keeps a real vicinity when stripping an invented rating from a Google-sourced entry', () => {
        expect(withoutInventedRating({ rating: 4.62117, userRatingsTotal: 88, vicinity: 'Quarry Bay', source: 'google' }))
            .toMatchObject({ rating: null, userRatingsTotal: null, vicinity: 'Quarry Bay', source: 'google' });
    });

    it.each([4.3, 5, 3.9, 4.1, 2.7])('leaves Google\'s one-decimal rating %s alone', (rating) => {
        const meta = { rating, userRatingsTotal: 1204, vicinity: 'Tai Koo', source: 'google' };
        expect(withoutInventedRating(meta)).toBe(meta);
    });

    it('leaves entries with no rating alone', () => {
        const meta = { rating: null, source: 'placeholder' };
        expect(withoutInventedRating(meta)).toBe(meta);
    });
});
