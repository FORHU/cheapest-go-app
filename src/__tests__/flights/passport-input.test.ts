import { describe, it, expect } from 'vitest';
import {
    sanitizePassportInput,
    validatePassport,
    isValidPassport,
    PASSPORT_MAX_LENGTH,
    ISSUERS_WITH_RULES,
} from '@/lib/passport';
import { flightPassengerSchema } from '@/lib/schemas/flight';

const passenger = (over: Record<string, unknown> = {}) => ({
    type: 'ADT',
    firstName: 'Juan',
    lastName: 'Dela Cruz',
    gender: 'M',
    birthDate: '1990-05-04',
    nationality: 'PH',
    passport: 'P1234567',
    passportExpiry: '2030-01-01',
    ...over,
});

describe('sanitizePassportInput', () => {
    it('strips separators that booklets print for legibility', () => {
        expect(sanitizePassportInput('P 123-4567')).toBe('P1234567');
        expect(sanitizePassportInput('EC 1234 567')).toBe('EC1234567');
    });

    it('uppercases, because that is the form the airline is sent', () => {
        expect(sanitizePassportInput('m12345678')).toBe('M12345678');
    });

    it('caps at the ICAO 9303 MRZ field width', () => {
        expect(PASSPORT_MAX_LENGTH).toBe(9);
        expect(sanitizePassportInput('A'.repeat(40))).toHaveLength(9);
    });

    it('handles empty and nullish input', () => {
        expect(sanitizePassportInput('')).toBe('');
        expect(sanitizePassportInput(null as unknown as string)).toBe('');
    });
});

describe('validatePassport — ICAO structure', () => {
    it('rejects an empty number', () => {
        expect(validatePassport('', 'PH')?.message).toMatch(/required/i);
    });

    it('rejects characters outside A–Z0–9', () => {
        expect(validatePassport('P-1234567', 'PH')?.message).toMatch(/letters and numbers/i);
    });

    it('rejects a number longer than the MRZ field', () => {
        expect(validatePassport('A1234567890', 'XX')?.message).toMatch(/at most 9/i);
    });

    it('rejects an all-letters value — no state issues one', () => {
        expect(validatePassport('ABCDEFG', 'XX')?.message).toMatch(/contains digits/i);
    });
});

describe('validatePassport — issuer formats', () => {
    it('accepts real Philippine formats', () => {
        expect(isValidPassport('P1234567', 'PH')).toBe(true);   // 1 letter + 7
        expect(isValidPassport('EC1234567', 'PH')).toBe(true);  // 2 letters + 7
    });

    it('rejects a Korean-shaped number presented as Philippine', () => {
        const problem = validatePassport('M12345678', 'PH');
        expect(problem?.message).toMatch(/Philippine passports are 1–2 letters/);
    });

    it('accepts and enforces the Korean format', () => {
        expect(isValidPassport('M12345678', 'KR')).toBe(true);
        expect(validatePassport('P1234567', 'KR')?.message).toMatch(/Korean passports are 1 letter/);
    });

    it('accepts the Japanese and Singapore formats', () => {
        expect(isValidPassport('TK1234567', 'JP')).toBe(true);
        expect(isValidPassport('K1234567A', 'SG')).toBe(true);
    });

    it('is case-insensitive about the issuer code', () => {
        expect(isValidPassport('P1234567', 'ph')).toBe(true);
    });

    // The asymmetry that shapes this module: wrongly rejecting a real passport
    // loses the booking outright, so unknown issuers pass on structure alone.
    it('falls back to structural validation for issuers with no rule', () => {
        expect(ISSUERS_WITH_RULES).not.toContain('BR');
        expect(isValidPassport('AB123456', 'BR')).toBe(true);
        expect(isValidPassport('XY9999999', 'BR')).toBe(true);
    });

    it('falls back to structure when nationality is missing', () => {
        expect(isValidPassport('P1234567')).toBe(true);
        expect(isValidPassport('P1234567', null)).toBe(true);
    });

    it('still enforces structure for unknown issuers', () => {
        expect(isValidPassport('AB', 'BR')).toBe(false);
        expect(isValidPassport('A!23456', 'BR')).toBe(false);
    });
});

describe('flightPassengerSchema — passport is validated against nationality', () => {
    it('accepts a matching passport and nationality', () => {
        expect(flightPassengerSchema.safeParse(passenger()).success).toBe(true);
    });

    it('rejects a passport whose shape contradicts the stated nationality', () => {
        // Same number, different issuer — valid as KR, invalid as PH.
        expect(flightPassengerSchema.safeParse(passenger({ passport: 'M12345678', nationality: 'KR' })).success).toBe(true);
        expect(flightPassengerSchema.safeParse(passenger({ passport: 'M12345678', nationality: 'PH' })).success).toBe(false);
    });

    it('anchors the error to the passport input, not the nationality', () => {
        const result = flightPassengerSchema.safeParse(passenger({ passport: 'M12345678', nationality: 'PH' }));
        expect(result.success).toBe(false);
        if (!result.success) {
            const issue = result.error.issues.find(i => i.path.join('.') === 'passport');
            expect(issue).toBeTruthy();
            expect(issue!.message).toMatch(/Philippine/);
        }
    });

    it('never produces a value the sanitiser would allow but the schema refuses on length', () => {
        const capped = sanitizePassportInput('A1'.repeat(40));
        expect(capped).toHaveLength(PASSPORT_MAX_LENGTH);
        // Structure passes; only an issuer rule could object, and 'XX' has none.
        expect(isValidPassport(capped, 'XX')).toBe(true);
    });
});
