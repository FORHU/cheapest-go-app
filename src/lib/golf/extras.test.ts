import { describe, it, expect } from 'vitest';
import { formatExtrasParam, parseExtrasParam, priceExtras, sameExtras, sanitizeExtras } from './extras';

const offers = [{ code: 'club_rental' as const, price: 45 }, { code: 'cart' as const, price: 25 }];

describe('parseExtrasParam / formatExtrasParam', () => {
    it('round-trips the checkout URL in a fixed order', () => {
        const choices = parseExtrasParam('cart:1,club_rental:2');
        expect(choices).toEqual([{ code: 'club_rental', quantity: 2 }, { code: 'cart', quantity: 1 }]);
        expect(formatExtrasParam(choices)).toBe('club_rental:2,cart:1');
    });

    it('drops unknown codes, bad numbers, zeros and repeats', () => {
        expect(parseExtrasParam('jetpack:1,caddie:x,cart:0,caddie:1,caddie:3')).toEqual([{ code: 'caddie', quantity: 1 }]);
        expect(parseExtrasParam(undefined)).toEqual([]);
        expect(formatExtrasParam([{ code: 'cart', quantity: 0 }])).toBe('');
    });
});

describe('sanitizeExtras', () => {
    it('keeps only offered extras, at most one per player', () => {
        expect(sanitizeExtras([{ code: 'caddie', quantity: 1 }, { code: 'club_rental', quantity: 4 }], offers, 2))
            .toEqual([{ code: 'club_rental', quantity: 2 }]);
    });
});

describe('priceExtras', () => {
    it('prices each line per item and totals them', () => {
        expect(priceExtras([{ code: 'cart', quantity: 1 }, { code: 'club_rental', quantity: 2 }], offers, 2)).toEqual({
            ok: true,
            lines: [
                { code: 'club_rental', quantity: 2, unitPrice: 45, total: 90 },
                { code: 'cart', quantity: 1, unitPrice: 25, total: 25 },
            ],
            total: 115,
        });
        expect(priceExtras([], offers, 2)).toEqual({ ok: true, lines: [], total: 0 });
    });

    it('refuses an extra the course does not offer, or more than one per player', () => {
        expect(priceExtras([{ code: 'caddie', quantity: 1 }], offers, 2)).toEqual({ ok: false, reason: 'not_offered', code: 'caddie' });
        expect(priceExtras([{ code: 'cart', quantity: 3 }], offers, 2)).toEqual({ ok: false, reason: 'too_many', code: 'cart' });
    });
});

describe('sameExtras', () => {
    it('ignores order and zero quantities', () => {
        expect(sameExtras([{ code: 'cart', quantity: 1 }, { code: 'caddie', quantity: 0 }], [{ code: 'cart', quantity: 1 }])).toBe(true);
        expect(sameExtras([{ code: 'cart', quantity: 1 }], [{ code: 'cart', quantity: 2 }])).toBe(false);
    });
});
