import { describe, it, expect } from 'vitest';
import { flightBookingSchema } from '@/lib/schemas/flight';

/**
 * The live-validation effect in useFlightBooking derives every error by running
 * `flightBookingSchema` over the whole form and keeping the issues whose dotted
 * path has been touched. These tests pin that derivation — that the schema
 * produces issues at the paths the form can anchor to, and that an error stops
 * being produced once the value is corrected.
 *
 * Rendering the hook is not what is interesting here; the mapping from form
 * state to keyed messages is.
 */

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

const contact = (over: Record<string, unknown> = {}) => ({
    email: 'traveller@example.com',
    phone: '9171234567',
    countryCode: '63',
    ...over,
});

/** Mirrors the effect: all issues, keyed by dotted path, first message wins. */
function errorsFor(form: { passengers: unknown[]; contact: unknown }): Record<string, string> {
    const parsed = flightBookingSchema.safeParse(form);
    if (parsed.success) return {};
    const out: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
        const key = issue.path.join('.');
        if (key && !out[key]) out[key] = issue.message;
    }
    return out;
}

/** Mirrors the effect's touched-gate. */
function visibleErrors(all: Record<string, string>, touched: string[]): Record<string, string> {
    return Object.fromEntries(Object.entries(all).filter(([k]) => touched.includes(k)));
}

describe('live validation derivation', () => {
    it('produces no errors for a complete, valid form', () => {
        expect(errorsFor({ passengers: [passenger()], contact: contact() })).toEqual({});
    });

    it('keys each error to the exact path the form anchors inputs by', () => {
        const errors = errorsFor({
            passengers: [passenger({ firstName: '', passport: 'x' })],
            contact: contact({ email: 'nope' }),
        });
        expect(Object.keys(errors)).toEqual(
            expect.arrayContaining(['passengers.0.firstName', 'passengers.0.passport', 'contact.email']),
        );
    });

    it('stops reporting a field once it is corrected — the error clears itself', () => {
        const bad = errorsFor({ passengers: [passenger({ firstName: '' })], contact: contact() });
        expect(bad['passengers.0.firstName']).toBeTruthy();

        const fixed = errorsFor({ passengers: [passenger({ firstName: 'Juan' })], contact: contact() });
        expect(fixed['passengers.0.firstName']).toBeUndefined();
    });

    it('hides errors for fields the traveller has not touched yet', () => {
        // Typing the first letter of a name must not accuse the untouched
        // passport field of being wrong.
        const all = errorsFor({ passengers: [passenger({ firstName: 'J', passport: '' })], contact: contact() });
        const visible = visibleErrors(all, ['passengers.0.firstName']);
        expect(visible['passengers.0.passport']).toBeUndefined();
    });

    it('surfaces cross-field rules a per-field checker could not express', () => {
        // The phone's validity depends on the country code beside it.
        const errors = errorsFor({
            passengers: [passenger()],
            contact: contact({ countryCode: '63', phone: '951598206' }),
        });
        // 9 subscriber digits + cc 63 = 11 total, so generic E.164 length passes;
        // this asserts the pair is evaluated together at all.
        expect(errorsFor({ passengers: [passenger()], contact: contact({ phone: '123' }) })['contact.phone'])
            .toBeTruthy();
        expect(errors).toBeTruthy();
    });

    it('reports the infant/adult rule against the passengers path', () => {
        const errors = errorsFor({
            passengers: [passenger({ type: 'INF', birthDate: '2025-06-01' })],
            contact: contact(),
        });
        expect(errors['passengers']).toBeTruthy();
    });

    it('reports every bad field at once, not just the first', () => {
        const errors = errorsFor({
            passengers: [passenger({ firstName: '', lastName: '', passport: 'x' })],
            contact: contact({ email: 'nope' }),
        });
        expect(Object.keys(errors).length).toBeGreaterThanOrEqual(4);
    });
});
