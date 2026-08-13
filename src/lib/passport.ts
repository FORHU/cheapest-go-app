/**
 * Passport number validation.
 *
 * ── What actually governs the format ─────────────────────────────────────────
 * ICAO Doc 9303 defines the machine-readable zone. The document number occupies
 * **9 characters** of line 2, drawn from A–Z and 0–9, right-padded with '<' when
 * shorter. That is the constraint airlines transmit under (APIS/APP), so 9 — not
 * an arbitrary 20 — is the real ceiling.
 *
 * Beyond that, the format is set by the **issuing state**, not by any universal
 * rule. A Korean passport is one letter and eight digits; a Philippine one is one
 * or two letters and seven digits. Which rule applies therefore depends on the
 * passenger's nationality — a different field — so this cannot be a per-field
 * check.
 *
 * ── Why issuer rules are advisory-strict, not absolute ───────────────────────
 * The cost here is asymmetric. Wrongly rejecting a real passport loses a booking
 * outright; wrongly accepting one is caught later by the airline. So:
 *
 *   - ICAO structure (charset, length) is enforced for everyone.
 *   - An issuer pattern is enforced only for states whose format is stable and
 *     well documented, listed below. Everything else passes on structure alone.
 *
 * When a state changes its numbering scheme, the fix is to relax or remove its
 * entry here — not to loosen the structural rule for everyone.
 */

/**
 * Shortest document number still in circulation. Deliberately permissive: some
 * older and diplomatic booklets are short, and rejecting one is unrecoverable
 * for the traveller.
 */
export const PASSPORT_MIN_LENGTH = 5;

/** ICAO 9303 MRZ document-number field width. */
export const PASSPORT_MAX_LENGTH = 9;

interface IssuerRule {
    pattern: RegExp;
    /** Written for the traveller, describing the shape their booklet actually has. */
    hint: string;
}

/**
 * Formats for the issuers this product actually serves.
 *
 * Add an entry only when the scheme is confirmed — an incorrect pattern here
 * rejects valid documents, which is the worst outcome this module can produce.
 */
const ISSUER_RULES: Record<string, IssuerRule> = {
    // 1–2 letters + 7 digits — e.g. P1234567, EC1234567
    PH: { pattern: /^[A-Z]{1,2}\d{7}$/, hint: 'Philippine passports are 1–2 letters followed by 7 digits (e.g. P1234567).' },
    // 1 letter + 8 digits — e.g. M12345678
    KR: { pattern: /^[A-Z]\d{8}$/, hint: 'Korean passports are 1 letter followed by 8 digits (e.g. M12345678).' },
    // 2 letters + 7 digits — e.g. TK1234567
    JP: { pattern: /^[A-Z]{2}\d{7}$/, hint: 'Japanese passports are 2 letters followed by 7 digits (e.g. TK1234567).' },
    // 1 letter + 8 digits — E/G/D/S/P series
    CN: { pattern: /^[A-Z]\d{8}$/, hint: 'Chinese passports are 1 letter followed by 8 digits (e.g. E12345678).' },
    // 1 letter + 7 digits + 1 check letter — e.g. K1234567A
    SG: { pattern: /^[A-Z]\d{7}[A-Z]$/, hint: 'Singapore passports are a letter, 7 digits, then a letter (e.g. K1234567A).' },
    // 1 letter + 8 digits — e.g. A12345678
    MY: { pattern: /^[A-Z]\d{8}$/, hint: 'Malaysian passports are 1 letter followed by 8 digits (e.g. A12345678).' },
};

export interface PassportValidationError {
    message: string;
}

/**
 * Reduce keystrokes or a pasted value to what an MRZ can carry: uppercase
 * A–Z and 0–9, capped at the ICAO field width.
 *
 * Applied on change rather than keydown so paste is covered — a number copied
 * from an email as "P 123-4567" becomes "P1234567". The separators some booklets
 * print for legibility are not part of the number.
 */
export function sanitizePassportInput(value: string): string {
    return String(value ?? '')
        .replace(/[^A-Za-z0-9]/g, '')
        // Uppercased because that is the form the airline is sent; leaving case to
        // the traveller means two spellings of one document.
        .toUpperCase()
        .slice(0, PASSPORT_MAX_LENGTH);
}

/**
 * Validate a passport number against ICAO structure and, where known, the
 * issuing state's format.
 *
 * `nationality` is the ISO-3166 alpha-2 code of the issuer. An unknown or absent
 * issuer falls back to structural validation only.
 */
export function validatePassport(
    value: string | null | undefined,
    nationality?: string | null,
): PassportValidationError | null {
    const number = String(value ?? '').trim().toUpperCase();

    if (!number) {
        return { message: 'Passport number is required.' };
    }
    if (!/^[A-Z0-9]+$/.test(number)) {
        return { message: 'Passport numbers use only letters and numbers.' };
    }
    if (number.length < PASSPORT_MIN_LENGTH) {
        return { message: 'That passport number looks too short.' };
    }
    if (number.length > PASSPORT_MAX_LENGTH) {
        return { message: `Passport numbers are at most ${PASSPORT_MAX_LENGTH} characters.` };
    }

    // All digits or all letters is not a scheme any state issues, and is the
    // signature of a mistyped or placeholder value.
    if (/^\d+$/.test(number) && number.length < 6) {
        return { message: 'That passport number looks too short.' };
    }
    if (/^[A-Z]+$/.test(number)) {
        return { message: 'A passport number contains digits as well as letters.' };
    }

    const issuer = String(nationality ?? '').trim().toUpperCase();
    const rule = ISSUER_RULES[issuer];
    if (rule && !rule.pattern.test(number)) {
        return { message: rule.hint };
    }

    return null;
}

/** True when the number is acceptable for the given issuer. */
export function isValidPassport(value: string | null | undefined, nationality?: string | null): boolean {
    return validatePassport(value, nationality) === null;
}

/** Issuers with a confirmed format rule — exported for tests and tooling. */
export const ISSUERS_WITH_RULES = Object.keys(ISSUER_RULES);
