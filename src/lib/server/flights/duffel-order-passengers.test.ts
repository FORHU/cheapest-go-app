import { describe, it, expect } from 'vitest';
import { buildDuffelOrderPassengers, duffelTitle, toE164Phone } from './duffel-order-passengers';

describe('toE164Phone', () => {
    it('joins the country code and the number, dropping punctuation and leading zeros', () => {
        expect(toE164Phone({ countryCode: '82', phone: '010-1234-5678' })).toEqual({ ok: true, e164: '+821012345678' });
        expect(toE164Phone({ countryCode: '+63', phone: '917 123 4567' })).toEqual({ ok: true, e164: '+639171234567' });
    });

    it('falls back to the default country code', () => {
        expect(toE164Phone({ phone: '10-1234-5678' })).toEqual({ ok: true, e164: '+821012345678' });
        expect(toE164Phone({ phone: '917 123 4567' }, '63')).toEqual({ ok: true, e164: '+639171234567' });
    });

    it('rejects a number that is too short to be real', () => {
        expect(toE164Phone({ countryCode: '82', phone: '123' })).toEqual({ ok: false });
        expect(toE164Phone({ countryCode: '82', phone: '' })).toEqual({ ok: false });
    });
});

describe('duffelTitle', () => {
    it('follows type and gender', () => {
        expect(duffelTitle({ gender: 'M', type: 'ADT' })).toBe('mr');
        expect(duffelTitle({ gender: 'F', type: 'ADT' })).toBe('ms');
        expect(duffelTitle({ gender: 'M', type: 'CHD' })).toBe('mr');
        expect(duffelTitle({ gender: 'F', type: 'INF' })).toBe('miss');
    });
});

describe('buildDuffelOrderPassengers', () => {
    it('maps submitted passengers onto the offer\'s passenger ids, in order', () => {
        const result = buildDuffelOrderPassengers({
            passengers: [
                { firstName: 'Ana', lastName: 'Cruz', birthDate: '1990-01-01', gender: 'F', type: 'ADT' },
                { firstName: 'Ben', lastName: 'Cruz', birthDate: '2015-05-05', gender: 'M', type: 'CHD' },
            ],
            contact: { email: 'ana@example.com' },
            rawOffer: { passengers: [{ id: 'pas_1' }, { id: 'pas_2' }] },
            e164: '+821012345678',
        });

        expect(result).toHaveLength(2);
        expect(result[0]).toMatchObject({
            id: 'pas_1', title: 'ms', given_name: 'Ana', family_name: 'Cruz', born_on: '1990-01-01',
            email: 'ana@example.com', phone_number: '+821012345678', gender: 'f',
        });
        expect(result[1]).toMatchObject({ id: 'pas_2', title: 'mr', given_name: 'Ben', gender: 'm' });
    });
});
