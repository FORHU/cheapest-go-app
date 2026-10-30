import { describe, it, expect } from 'vitest';
import { buildDuffelOrderPassengers } from './duffel-order-passengers';

const rawOffer = { id: 'off_1', passengers: [{ id: 'pas_a' }, { id: 'pas_b' }] };
const pax = [
    { firstName: 'Ana', lastName: 'Cruz', birthDate: '1990-02-03', gender: 'F', type: 'ADT' },
    { firstName: 'Bo', lastName: 'Cruz', birthDate: '2018-05-06', gender: 'M', type: 'CHD' },
];
const contact = { email: 'ana@example.com', phone: '0917 123 4567', countryCode: '+63' };

describe('buildDuffelOrderPassengers', () => {
    it('maps each passenger onto the offer passenger id at the same position', () => {
        const r = buildDuffelOrderPassengers(rawOffer, pax, contact);
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.passengers.map(p => p.id)).toEqual(['pas_a', 'pas_b']);
            expect(r.passengers[0]).toMatchObject({ given_name: 'Ana', family_name: 'Cruz', born_on: '1990-02-03', email: 'ana@example.com', gender: 'f' });
        }
    });

    it('builds E.164 from the country code and a phone without its trunk zero', () => {
        const r = buildDuffelOrderPassengers(rawOffer, pax, contact);
        if (r.ok) expect(r.passengers[0].phone_number).toBe('+639171234567');
    });

    it('titles adults by gender and children as mr/miss', () => {
        const r = buildDuffelOrderPassengers(rawOffer, pax, contact);
        if (r.ok) expect(r.passengers.map(p => p.title)).toEqual(['ms', 'mr']);
    });

    it('refuses a phone number that cannot be E.164', () => {
        const r = buildDuffelOrderPassengers(rawOffer, pax, { ...contact, phone: '12' });
        expect(r).toMatchObject({ ok: false, code: 'phone_number_invalid' });
    });
});
