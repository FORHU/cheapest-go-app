import { describe, it, expect } from 'vitest';
import { computeOrderTotal, quoteHash } from './flight-quote';

describe('computeOrderTotal', () => {
    const offer = {
        total_amount: '100.00',
        available_services: [
            { id: 'ase_seat', total_amount: '12.50' },
            { id: 'ase_bag', total_amount: '20.00' },
        ],
    };

    it('adds the offer own prices for the selected seats and bags', () => {
        expect(computeOrderTotal(offer, ['ase_seat'], ['ase_bag'])).toEqual({ total: '132.50', base: 100, seatExtra: 12.5, bagExtra: 20 });
    });

    it('ignores a service the offer does not list', () => {
        expect(computeOrderTotal(offer, ['ase_gone'], []).total).toBe('100.00');
    });
});

describe('quoteHash', () => {
    const base = {
        offerId: 'off_1',
        passengers: [{ firstName: 'Ana', lastName: 'Cruz', birthDate: '1990-02-03' }],
        seatServiceIds: ['s2', 's1'],
        bagServiceIds: [],
        chargeCurrency: 'USD',
        amountMinor: 10_700,
    };

    it('is stable across case, padding and service order', () => {
        const same = quoteHash({
            ...base,
            passengers: [{ firstName: '  ANA ', lastName: 'cruz', birthDate: '1990-02-03' }],
            seatServiceIds: ['s1', 's2'],
            chargeCurrency: 'usd',
        });
        expect(same).toBe(quoteHash(base));
    });

    it('is 32 hex characters', () => {
        expect(quoteHash(base)).toMatch(/^[0-9a-f]{32}$/);
    });

    it.each([
        ['a corrected name', { passengers: [{ firstName: 'Anna', lastName: 'Cruz', birthDate: '1990-02-03' }] }],
        ['a different date of birth', { passengers: [{ firstName: 'Ana', lastName: 'Cruz', birthDate: '1990-02-04' }] }],
        ['an added bag', { bagServiceIds: ['b1'] }],
        ['a different offer', { offerId: 'off_2' }],
        ['a different charge amount', { amountMinor: 10_800 }],
        ['a different charge currency', { chargeCurrency: 'PHP' }],
    ])('changes with %s', (_label, change) => {
        expect(quoteHash({ ...base, ...change })).not.toBe(quoteHash(base));
    });
});
