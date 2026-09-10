import { describe, it, expect } from 'vitest';
import {
    urgencyOfTrip,
    urgencyOfConversation,
    isUrgency,
    URGENCY_RANK,
    URGENCY_SQL,
    CRITICAL_WITHIN_HOURS,
    HIGH_WITHIN_HOURS,
} from './urgency';

/**
 * The queue is ordered by how close the customer is to travelling (ADR-0039).
 *
 * The cases that matter are not the arithmetic but the boundaries: someone inside their
 * trip, someone whose trip has finished, and someone with no trip at all. Each of those is
 * a person waiting, and getting the tier wrong means answering them in the wrong order.
 */

const NOW = new Date('2026-09-09T12:00:00Z');
const hours = (n: number) => new Date(NOW.getTime() + n * 3_600_000);

describe('urgency of a single trip', () => {
    it('is critical while the customer is on the trip', () => {
        // The case with the least room to wait: they are in the hotel tonight.
        expect(urgencyOfTrip(hours(-24), hours(48), NOW)).toBe('critical');
        // Boundaries count as inside — a trip starting exactly now has begun.
        expect(urgencyOfTrip(NOW, hours(48), NOW)).toBe('critical');
        expect(urgencyOfTrip(hours(-48), NOW, NOW)).toBe('critical');
    });

    it('is critical when the trip starts within a day', () => {
        expect(urgencyOfTrip(hours(3), hours(72), NOW)).toBe('critical');
        expect(urgencyOfTrip(hours(CRITICAL_WITHIN_HOURS), hours(72), NOW)).toBe('critical');
    });

    it('is high from a day out to a week out', () => {
        expect(urgencyOfTrip(hours(CRITICAL_WITHIN_HOURS + 1), hours(200), NOW)).toBe('high');
        expect(urgencyOfTrip(hours(HIGH_WITHIN_HOURS), hours(400), NOW)).toBe('high');
    });

    it('is normal further out than a week', () => {
        expect(urgencyOfTrip(hours(HIGH_WITHIN_HOURS + 1), hours(400), NOW)).toBe('normal');
        expect(urgencyOfTrip(hours(24 * 90), hours(24 * 95), NOW)).toBe('normal');
    });

    it('is normal, not low, once the trip is over', () => {
        // A refund or a complaint about a trip that went wrong is ordinary support. Sorting
        // it below a general question would say the opposite of what we mean.
        expect(urgencyOfTrip(hours(-240), hours(-120), NOW)).toBe('normal');
    });

    it('is normal when there are no dates to read', () => {
        expect(urgencyOfTrip(null, null, NOW)).toBe('normal');
    });

    it('treats a trip with only a start as a single moment', () => {
        // A one-way flight has a departure and no meaningful end.
        expect(urgencyOfTrip(hours(2), null, NOW)).toBe('critical');
        expect(urgencyOfTrip(hours(-2), null, NOW)).toBe('normal');
    });
});

describe('urgency of a conversation', () => {
    it('takes the most urgent of several trips', () => {
        // A flight tomorrow and a hotel next month: the imminent half decides.
        const trips = [
            { startsAt: hours(24 * 40), endsAt: hours(24 * 45) },  // normal
            { startsAt: hours(6), endsAt: hours(30) },             // critical
        ];
        expect(urgencyOfConversation(trips, null, NOW)).toBe('critical');
    });

    it('is normal when no booking is linked', () => {
        // The sharpest edge of the design: a customer whose booking we failed to link is
        // treated as unhurried. Pinned so the consequence stays visible.
        expect(urgencyOfConversation([], null, NOW)).toBe('normal');
    });

    it("lets an Agent's override win over the dates", () => {
        const imminent = [{ startsAt: hours(2), endsAt: hours(48) }];
        expect(urgencyOfConversation(imminent, 'low', NOW)).toBe('low');

        const distant = [{ startsAt: hours(24 * 60), endsAt: hours(24 * 65) }];
        expect(urgencyOfConversation(distant, 'critical', NOW)).toBe('critical');
    });

    it('falls back to the dates when the override is cleared', () => {
        // NULL priority means "use the computed value" — it is not the same as 'normal'.
        const imminent = [{ startsAt: hours(2), endsAt: hours(48) }];
        expect(urgencyOfConversation(imminent, null, NOW)).toBe('critical');
    });
});

describe('urgency ranking', () => {
    it('orders the tiers so a plain sort puts the most urgent first', () => {
        expect(URGENCY_RANK.critical).toBeGreaterThan(URGENCY_RANK.high);
        expect(URGENCY_RANK.high).toBeGreaterThan(URGENCY_RANK.normal);
        expect(URGENCY_RANK.normal).toBeGreaterThan(URGENCY_RANK.low);
    });

    it('recognises its own tiers and nothing else', () => {
        expect(isUrgency('critical')).toBe(true);
        expect(isUrgency('normal')).toBe(true);
        expect(isUrgency('urgent')).toBe(false);   // a plausible word that is not a tier
        expect(isUrgency('LOW')).toBe(false);      // the column stores lower case
        expect(isUrgency(undefined)).toBe(false);
    });
});

/**
 * The rule exists twice — once in TypeScript for the app, once in SQL for the queue — and
 * two expressions of one rule drift. These do not re-implement the SQL; they check that the
 * thresholds and ranks it was built from are the ones this module still exports, so a
 * change to `CRITICAL_WITHIN_HOURS` cannot silently leave the queue on the old value.
 */
describe('the SQL ordering agrees with the TypeScript rule', () => {
    it('uses the same rank for every tier', () => {
        for (const [tier, rank] of Object.entries(URGENCY_RANK)) {
            expect(URGENCY_SQL, tier).toContain(`WHEN '${tier}'`);
            expect(URGENCY_SQL, tier).toContain(String(rank));
        }
    });

    it('uses the same thresholds', () => {
        expect(URGENCY_SQL).toContain(`interval '${CRITICAL_WITHIN_HOURS} hours'`);
        expect(URGENCY_SQL).toContain(`interval '${HIGH_WITHIN_HOURS} hours'`);
    });

    it('defaults an unlinked conversation to normal, as the TypeScript rule does', () => {
        // The COALESCE tail: no override, no linked booking.
        expect(URGENCY_SQL.trimEnd().endsWith(`${URGENCY_RANK.normal}\n    )`)).toBe(true);
        expect(urgencyOfConversation([], null, NOW)).toBe('normal');
    });

    it('reads both a stay and a flight, since a reference names either', () => {
        expect(URGENCY_SQL).toContain('bookings b');
        expect(URGENCY_SQL).toContain('flight_segments fs');
        // Joined on the reference, because no foreign key can point at two tables.
        expect(URGENCY_SQL).toContain('b.booking_reference = scb.booking_reference');
        expect(URGENCY_SQL).toContain('fb.booking_reference = scb.booking_reference');
    });
});
