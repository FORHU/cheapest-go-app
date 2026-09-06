import { describe, it, expect } from 'vitest';
import { summariseBookings, supportTools } from './tools';

/**
 * What the model is allowed to know, and in what shape.
 *
 * The shaping is not cosmetic. Everything returned here is a string the model may repeat
 * to whoever is in the chat, so a field included by accident is a field disclosed by
 * accident — and a raw booking row carries a payment intent, a supplier reference and an
 * email address, none of which belong in a support answer.
 */

const booking = {
    booking_reference: 'CG-481002',
    status: 'confirmed',
    property_name: 'Seda Central Bloc',
    check_in: '2026-10-02',
    check_out: '2026-10-05',
    total_price: 18240,
    currency: 'PHP',
    // Everything below must not survive the summary.
    user_id: '11111111-1111-1111-1111-111111111111',
    guest_email: 'ana@example.com',
    stripe_payment_intent_id: 'pi_3QabcDEF',
    external_id: 'ETG-99182',
    raw_provider_response: { secret: 'supplier payload' },
};

describe('summariseBookings', () => {
    it('keeps what a customer would ask about', () => {
        expect(summariseBookings([booking])).toEqual([
            {
                reference: 'CG-481002',
                status: 'confirmed',
                property: 'Seda Central Bloc',
                checkIn: '2026-10-02',
                checkOut: '2026-10-05',
                total: '18240 PHP',
            },
        ]);
    });

    it('drops identifiers and payment details rather than passing the row through', () => {
        const [summary] = summariseBookings([booking]);
        const serialised = JSON.stringify(summary);

        for (const leak of [
            '11111111-1111-1111-1111-111111111111',
            'ana@example.com',
            'pi_3QabcDEF',
            'ETG-99182',
            'supplier payload',
        ]) {
            expect(serialised, `${leak} reached the model`).not.toContain(leak);
        }
    });

    it('survives a row with fields missing', () => {
        // Flight and hotel rows do not carry the same columns, and older rows predate
        // booking_reference entirely. A thrown error here becomes a handover.
        expect(summariseBookings([{ status: 'confirmed' }])).toEqual([
            {
                reference: null,
                status: 'confirmed',
                property: null,
                checkIn: null,
                checkOut: null,
                total: null,
            },
        ]);
    });

    it('returns nothing for someone with no bookings', () => {
        expect(summariseBookings([])).toEqual([]);
    });
});

describe('supportTools', () => {
    it('offers only read-only tools', () => {
        // The allow-list is the registry: a tool that is not here cannot be called, and
        // nothing that changes a booking is here. See ADR-0029 and the escalation rule.
        const names = supportTools().map(tool => tool.name);

        for (const write of ['cancel_booking', 'cancel_flight', 'amend_booking', 'manage_price_alerts']) {
            expect(names, `${write} must not be reachable by the model`).not.toContain(write);
        }
    });

    it('marks the booking lookup as needing a session', () => {
        // ADR-0029: an unverified email is not a credential, so this tool is offered only
        // when a Lucia session says who is asking.
        const bookings = supportTools().find(tool => tool.name === 'get_bookings');

        expect(bookings?.requiresSession).toBe(true);
    });

    it('gives every tool a description and a schema, so it can be offered at all', () => {
        for (const tool of supportTools()) {
            expect(tool.description.length, `${tool.name} has no description`).toBeGreaterThan(0);
            expect(tool.parameters, `${tool.name} has no schema`).toHaveProperty('type', 'object');
        }
    });

    it('refuses to run the booking lookup without a user, whatever the caller passes', () => {
        // Belt and braces behind the offer list: if a wiring bug ever offered this to a
        // guest, it still must not read anyone's bookings.
        const bookings = supportTools().find(tool => tool.name === 'get_bookings');

        return expect(bookings?.run({}, { userId: null })).rejects.toThrow(/sign in|session/i);
    });
});
