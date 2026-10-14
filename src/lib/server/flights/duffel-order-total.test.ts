import { describe, it, expect } from 'vitest';
import { computeOrderTotal } from './duffel-order-total';

const OFFER = {
    total_amount: '100.00',
    available_services: [
        { id: 'ase_seat', total_amount: '12.50' },
        { id: 'ase_bag', total_amount: '20.00' },
    ],
};

describe('computeOrderTotal', () => {
    it('is the bare fare when nothing is selected', () => {
        expect(computeOrderTotal(OFFER, undefined, undefined)).toEqual({ total: '100.00', base: 100, seatExtra: 0, bagExtra: 0 });
    });

    it('adds the offer\'s own prices for the selected seats and bags', () => {
        expect(computeOrderTotal(OFFER, ['ase_seat'], ['ase_bag'])).toEqual({ total: '132.50', base: 100, seatExtra: 12.5, bagExtra: 20 });
    });

    it('leaves out a service the offer does not list, rather than trusting the caller', () => {
        expect(computeOrderTotal(OFFER, ['ase_unknown'], undefined).total).toBe('100.00');
    });

    it('is 0.00 for an offer with no total', () => {
        expect(computeOrderTotal({}, undefined, undefined).total).toBe('0.00');
    });
});
