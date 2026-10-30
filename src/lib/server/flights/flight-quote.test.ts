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
    const pax = {
        firstName: 'Ana',
        lastName: 'Cruz',
        birthDate: '1990-02-03',
        type: 'ADT',
        gender: 'F',
        passport: 'P1234567',
        passportExpiry: '2032-01-01',
        nationality: 'PH',
    };
    const base = {
        offerId: 'off_1',
        passengers: [pax],
        contact: { email: 'ana@example.com', phone: '0917 123 4567', countryCode: '+63' },
        seatServiceIds: ['s2', 's1'],
        bagServiceIds: [] as string[],
        chargeCurrency: 'USD',
        amountMinor: 10_700,
    };
    const withPax = (change: Record<string, string>) => ({ ...base, passengers: [{ ...pax, ...change }] });
    const withContact = (change: Record<string, string>) => ({ ...base, contact: { ...base.contact, ...change } });

    it('is 32 hex characters', () => {
        expect(quoteHash(base)).toMatch(/^[0-9a-f]{32}$/);
    });

    it('is deterministic', () => {
        expect(quoteHash({ ...base })).toBe(quoteHash(base));
    });

    describe('stays the same across', () => {
        it('a case-only change', () => {
            expect(quoteHash(withPax({ firstName: 'ANA', lastName: 'cRuZ', passport: 'p1234567', nationality: 'ph' }))).toBe(quoteHash(base));
        });

        it('a whitespace-only change', () => {
            expect(quoteHash(withPax({ firstName: '  Ana ', lastName: 'Cruz  ', birthDate: ' 1990-02-03 ' }))).toBe(quoteHash(base));
            expect(quoteHash(withPax({ firstName: 'Ana   Marie' }))).toBe(quoteHash(withPax({ firstName: 'Ana Marie' })));
        });

        it('the order of seat service ids', () => {
            expect(quoteHash({ ...base, seatServiceIds: ['s1', 's2'] })).toBe(quoteHash(base));
        });

        it('the order of bag service ids', () => {
            const two = { ...base, bagServiceIds: ['b1', 'b2'] };
            expect(quoteHash({ ...two, bagServiceIds: ['b2', 'b1'] })).toBe(quoteHash(two));
        });

        it('phone formatting', () => {
            expect(quoteHash(withContact({ phone: '9171234567' }))).toBe(quoteHash(base));
            expect(quoteHash(withContact({ phone: '(0917) 123-4567' }))).toBe(quoteHash(base));
        });

        it('country code formatting', () => {
            expect(quoteHash(withContact({ countryCode: '63' }))).toBe(quoteHash(base));
        });

        it('a missing country code, which defaults to 82', () => {
            const noCode = { ...base, contact: { email: 'ana@example.com', phone: '010 1234 5678' } };
            expect(quoteHash(noCode)).toBe(quoteHash(withContact({ phone: '10 1234 5678', countryCode: '82' })));
            expect(quoteHash(withContact({ countryCode: '' }))).toBe(quoteHash(withContact({ countryCode: '82' })));
        });

        it('email case and padding', () => {
            expect(quoteHash(withContact({ email: '  ANA@Example.COM ' }))).toBe(quoteHash(base));
        });

        it('currency case', () => {
            expect(quoteHash({ ...base, chargeCurrency: 'usd' })).toBe(quoteHash(base));
        });

        it('a missing optional value versus an empty one', () => {
            const { passport: _p, ...noPassport } = pax;
            expect(quoteHash({ ...base, passengers: [noPassport] })).toBe(quoteHash(withPax({ passport: '' })));
            const { contact: _c, ...noContact } = base;
            expect(quoteHash(noContact)).toBe(quoteHash({ ...base, contact: { email: '', phone: '', countryCode: '' } }));
        });
    });

    describe('changes with', () => {
        it.each([
            ['a corrected name', withPax({ firstName: 'Anna' })],
            ['a corrected surname', withPax({ lastName: 'Cruzado' })],
            ['a different date of birth', withPax({ birthDate: '1990-02-04' })],
            ['a different passenger type', withPax({ type: 'CHD' })],
            ['a different gender', withPax({ gender: 'M' })],
            ['a different passport', withPax({ passport: 'P7654321' })],
            ['a different passport expiry', withPax({ passportExpiry: '2033-01-01' })],
            ['a different nationality', withPax({ nationality: 'KR' })],
            ['a different contact email', withContact({ email: 'other@example.com' })],
            ['a different contact phone', withContact({ phone: '0917 123 4568' })],
            ['a different contact country code', withContact({ countryCode: '82' })],
            ['an added bag', { ...base, bagServiceIds: ['b1'] }],
            ['a removed seat', { ...base, seatServiceIds: ['s1'] }],
            ['a changed seat', { ...base, seatServiceIds: ['s1', 's3'] }],
            ['a different offer', { ...base, offerId: 'off_2' }],
            ['a different charge amount', { ...base, amountMinor: 10_800 }],
            ['a different charge currency', { ...base, chargeCurrency: 'PHP' }],
            ['an added passenger', { ...base, passengers: [pax, { ...pax, firstName: 'Ben' }] }],
        ])('%s', (_label, change) => {
            expect(quoteHash(change)).not.toBe(quoteHash(base));
        });

        it('passenger order', () => {
            const ben = { ...pax, firstName: 'Ben', birthDate: '1985-05-05' };
            expect(quoteHash({ ...base, passengers: [pax, ben] })).not.toBe(quoteHash({ ...base, passengers: [ben, pax] }));
        });

        it('passenger count', () => {
            expect(quoteHash({ ...base, passengers: [pax, pax] })).not.toBe(quoteHash(base));
        });
    });

    it('does not let adjacent service ids collide', () => {
        expect(quoteHash({ ...base, seatServiceIds: ['ab', 'c'] })).not.toBe(quoteHash({ ...base, seatServiceIds: ['a', 'bc'] }));
        expect(quoteHash({ ...base, bagServiceIds: ['ab', 'c'] })).not.toBe(quoteHash({ ...base, bagServiceIds: ['a', 'bc'] }));
    });

    it('does not let a value move between passenger fields', () => {
        expect(quoteHash(withPax({ firstName: 'Ana', lastName: 'Cruz' }))).not.toBe(quoteHash(withPax({ firstName: 'AnaCruz', lastName: '' })));
    });
});
