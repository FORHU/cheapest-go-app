import { describe, it, expect } from 'vitest';
import { validatePhone, isValidPhone, normalizePhone, toE164 } from '@/lib/phone';
import { flightContactSchema } from '@/lib/schemas/flight';

const contact = (over: Record<string, unknown> = {}) => ({
    email: 'traveller@example.com',
    phone: '1012345678',
    countryCode: '82',
    ...over,
});

describe('normalizePhone', () => {
    it('strips formatting and the national trunk prefix', () => {
        // Korean mobiles are written "010-…" nationally but the leading 0 must
        // not appear in the international form.
        expect(normalizePhone('82', '010-1234-5678')).toEqual({ countryCode: '82', subscriber: '1012345678' });
    });

    it('accepts a country code written with + or leading zeros', () => {
        expect(normalizePhone('+82', '1012345678').countryCode).toBe('82');
        expect(normalizePhone('0082', '1012345678').countryCode).toBe('82');
    });

    it('builds the E.164 string', () => {
        expect(toE164(normalizePhone('82', '010 1234 5678'))).toBe('+821012345678');
    });
});

describe('validatePhone', () => {
    it('accepts well-formed numbers across country codes', () => {
        expect(isValidPhone('82', '010-1234-5678')).toBe(true);   // KR
        expect(isValidPhone('63', '917 123 4567')).toBe(true);    // PH
        expect(isValidPhone('1', '2125551234')).toBe(true);       // US
        expect(isValidPhone('44', '7911123456')).toBe(true);      // UK
    });

    it('rejects a + typed into the number field', () => {
        // The country code has its own selector, so a + here means it was
        // entered twice — the most common way a number reaches the airline bad.
        const problem = validatePhone('82', '+82 10 1234 5678');
        expect(problem?.field).toBe('phone');
        expect(problem?.message).toMatch(/without the country code/i);
    });

    it('rejects a number that repeats the selected country code', () => {
        const problem = validatePhone('82', '82 10 1234 5678');
        expect(problem?.field).toBe('phone');
        expect(problem?.message).toMatch(/Remove the leading 82/);
    });

    it('does not flag a number that merely begins with those digits', () => {
        // "8210…" with only a few digits left over is a real number, not a
        // duplicated country code.
        expect(isValidPhone('82', '821012')).toBe(true);
    });

    it('rejects letters and empty input', () => {
        expect(validatePhone('82', 'abcde')?.field).toBe('phone');
        expect(validatePhone('82', '')?.field).toBe('phone');
        expect(validatePhone('82', '   ')?.field).toBe('phone');
    });

    it('rejects numbers that are too short or too long for E.164', () => {
        expect(validatePhone('82', '123')?.message).toMatch(/too short/i);
        expect(validatePhone('82', '1234567890123456')?.message).toMatch(/too long/i);
    });

    it('rejects a missing or oversized country code, pointing at that field', () => {
        expect(validatePhone('', '1012345678')?.field).toBe('countryCode');
        expect(validatePhone('12345', '1012345678')?.field).toBe('countryCode');
    });
});

describe('flightContactSchema — submit-time enforcement', () => {
    it('accepts a valid contact', () => {
        expect(flightContactSchema.safeParse(contact()).success).toBe(true);
    });

    it('rejects "abcde", which the old length-only rule allowed through', () => {
        const result = flightContactSchema.safeParse(contact({ phone: 'abcde' }));
        expect(result.success).toBe(false);
    });

    it('reports the issue at the path the form uses to place inline errors', () => {
        // FlightBookContent locates inputs by data-field="<dotted zod path>",
        // so the path decides whether the message appears under the input or
        // only in the banner.
        const result = flightContactSchema.safeParse(contact({ phone: '+82 10 1234 5678' }));
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].path).toEqual(['phone']);
        }
    });

    it('points country-code problems at the country-code field', () => {
        const result = flightContactSchema.safeParse(contact({ countryCode: '' }));
        expect(result.success).toBe(false);
        if (!result.success) {
            // min(1) fires first for an empty string; either way it is on countryCode.
            expect(result.error.issues[0].path).toEqual(['countryCode']);
        }
    });

    it('still validates email alongside the phone', () => {
        expect(flightContactSchema.safeParse(contact({ email: 'nope' })).success).toBe(false);
    });
});
