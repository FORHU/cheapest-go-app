/**
 * E.164 phone handling for airline bookings.
 *
 * Airlines reject malformed contact numbers at order creation, and Duffel
 * surfaces that as `phone_number_invalid` — by which point the traveller has
 * filled in the whole form and watched a "Booking Failed" screen. The same rule
 * therefore has to run at form submission, so the error lands under the input
 * instead of after the booking attempt.
 *
 * One module so the Zod schema (client submit + server body validation) and the
 * order builder in /api/flights/book cannot drift: they agree by construction
 * rather than by two copies of a regex.
 *
 * E.164: a leading '+', a 1–3 digit country calling code, then the subscriber
 * number, 15 digits maximum in total.
 */

export interface PhoneParts {
    /** Digits only, no '+'. */
    countryCode: string;
    /** Digits only, national trunk prefix (leading zeros) removed. */
    subscriber: string;
}

export interface PhoneValidationError {
    /** Which input the message belongs under. */
    field: 'phone' | 'countryCode';
    message: string;
}

/** Total digits E.164 permits after the '+'. */
const E164_MIN_DIGITS = 7;
const E164_MAX_DIGITS = 15;
/** Shortest plausible subscriber number, independent of the country code. */
const MIN_SUBSCRIBER_DIGITS = 4;

/**
 * Reduce raw form input to E.164 parts.
 *
 * Leading zeros are stripped from the subscriber number: they are a *national*
 * trunk prefix ("010 1234 5678" in Korea) and must not appear in the
 * international form, which is a common cause of airline rejection.
 */
export function normalizePhone(countryCode: string | null | undefined, phone: string | null | undefined): PhoneParts {
    // Leading zeros are stripped from the country code too: no calling code
    // begins with 0, so they are always an international access prefix ("0082",
    // "01182"). The previous implementation claimed to handle "0082" but only
    // removed non-digits, so it produced the invalid "+0082…".
    const cc = String(countryCode ?? '').replace(/\D/g, '').replace(/^0+/, '');
    const subscriber = String(phone ?? '').replace(/\D/g, '').replace(/^0+/, '');
    return { countryCode: cc, subscriber };
}

/** Render parts as an E.164 string, e.g. "+821012345678". */
export function toE164(parts: PhoneParts): string {
    return `+${parts.countryCode}${parts.subscriber}`;
}

/**
 * Validate a contact number as an airline would.
 *
 * Returns the first problem found, or null when the number is acceptable.
 * Messages are written for the traveller, not for a log.
 */
export function validatePhone(
    countryCode: string | null | undefined,
    phone: string | null | undefined,
): PhoneValidationError | null {
    const raw = String(phone ?? '');

    // The country code has its own selector. A '+' typed into the number field
    // almost always means it was entered twice — the single most common way a
    // number reaches the airline malformed.
    if (raw.includes('+')) {
        return {
            field: 'phone',
            message: 'Enter the number without the country code — select it from the list instead.',
        };
    }

    const { countryCode: cc, subscriber } = normalizePhone(countryCode, phone);

    if (!cc) {
        return { field: 'countryCode', message: 'Select a country code.' };
    }
    if (cc.length > 3) {
        return { field: 'countryCode', message: 'Country codes are at most 3 digits.' };
    }
    if (!subscriber) {
        return { field: 'phone', message: 'Enter a phone number.' };
    }
    if (subscriber.length < MIN_SUBSCRIBER_DIGITS) {
        return { field: 'phone', message: 'That number looks too short.' };
    }

    // A subscriber number that repeats the selected country code is the same
    // double-entry mistake as a '+', just without the symbol. Only flagged when
    // enough digits remain to still be a real number, so numbers that genuinely
    // begin with those digits are left alone.
    if (subscriber.startsWith(cc) && subscriber.length - cc.length >= MIN_SUBSCRIBER_DIGITS + 2) {
        return {
            field: 'phone',
            message: `Remove the leading ${cc} — the country code is already selected.`,
        };
    }

    const total = cc.length + subscriber.length;
    if (total < E164_MIN_DIGITS) {
        return { field: 'phone', message: 'That number looks too short.' };
    }
    if (total > E164_MAX_DIGITS) {
        return { field: 'phone', message: 'That number looks too long.' };
    }

    return null;
}

/** True when the pair forms a number an airline will accept. */
export function isValidPhone(countryCode: string | null | undefined, phone: string | null | undefined): boolean {
    return validatePhone(countryCode, phone) === null;
}
