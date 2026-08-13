import { describe, it, expect } from 'vitest';
import { sanitizePhoneInput, maxSubscriberLength, isValidPhone, E164_MAX_DIGITS } from '@/lib/phone';

describe('maxSubscriberLength', () => {
    it('leaves the rest of the E.164 budget after the country code', () => {
        expect(maxSubscriberLength('1')).toBe(E164_MAX_DIGITS - 1);   // US
        expect(maxSubscriberLength('63')).toBe(E164_MAX_DIGITS - 2);  // PH
        expect(maxSubscriberLength('355')).toBe(E164_MAX_DIGITS - 3); // AL
    });

    it('ignores formatting and an international access prefix in the code', () => {
        expect(maxSubscriberLength('+63')).toBe(maxSubscriberLength('63'));
        expect(maxSubscriberLength('0063')).toBe(maxSubscriberLength('63'));
    });

    it('never returns a length that would make every number invalid', () => {
        expect(maxSubscriberLength('')).toBeGreaterThanOrEqual(4);
        expect(maxSubscriberLength(null)).toBeGreaterThanOrEqual(4);
    });
});

describe('sanitizePhoneInput', () => {
    it('drops every non-digit character', () => {
        expect(sanitizePhoneInput('0951-598-2061', '63')).toBe('09515982061');
        expect(sanitizePhoneInput('(0951) 598 2061', '63')).toBe('09515982061');
        expect(sanitizePhoneInput('abc123def', '63')).toBe('123');
    });

    it('strips a pasted + and country code down to digits', () => {
        // Pasting "+63 951 598 2061" must not leave punctuation the airline rejects.
        expect(sanitizePhoneInput('+63 951 598 2061', '63')).toBe('639515982061');
    });

    it('keeps a leading national trunk zero, which people actually type', () => {
        expect(sanitizePhoneInput('09515982061', '63')).toBe('09515982061');
    });

    it('caps input at the remaining E.164 budget', () => {
        const long = '9'.repeat(30);
        expect(sanitizePhoneInput(long, '63')).toHaveLength(E164_MAX_DIGITS - 2);
        expect(sanitizePhoneInput(long, '1')).toHaveLength(E164_MAX_DIGITS - 1);
    });

    it('handles empty and nullish input', () => {
        expect(sanitizePhoneInput('', '63')).toBe('');
        expect(sanitizePhoneInput(null as unknown as string, '63')).toBe('');
    });

    it('never produces a value the validator would call too long', () => {
        // The input cap and validatePhone must agree, or the field would accept
        // something it then refuses.
        for (const cc of ['1', '63', '82', '355']) {
            const capped = sanitizePhoneInput('9'.repeat(40), cc);
            const problem = isValidPhone(cc, capped);
            expect(problem, `cc=${cc} produced an over-long value`).toBe(true);
        }
    });

    it('re-caps an existing number when the country code grows', () => {
        // Typed under a 1-digit code, then switched to a 3-digit one.
        const typed = sanitizePhoneInput('9'.repeat(20), '1');
        expect(typed).toHaveLength(E164_MAX_DIGITS - 1);
        const recapped = sanitizePhoneInput(typed, '355');
        expect(recapped).toHaveLength(E164_MAX_DIGITS - 3);
    });
});
