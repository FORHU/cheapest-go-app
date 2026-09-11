/**
 * The trips a Support Chat is about.
 *
 * Any number, including none. A customer has at most one open Support Chat, so the single
 * chat that is open carries every question they have — and a trip is routinely a flight and
 * a hotel bought separately. Zero is equally normal: "how do refunds work" is about no trip
 * in particular and is not incomplete for it.
 *
 * Linked by booking reference rather than by a foreign key, because the reference is the
 * one identifier `bookings` and `flight_bookings` share, no foreign key can point at two
 * tables, and the reference is what the customer says out loud.
 */

import { getSqlAdmin } from '@/lib/db/postgres';

export interface LinkedBooking {
    bookingReference: string;
    /** The Agent who attached it; null when the customer chose it themselves. */
    linkedBy: string | null;
    linkedAt: string;
    /**
     * Whether this reference matches a booking in our own tables.
     *
     * Usually true and uninteresting. It is false in two very different cases and the
     * screen has to let an Agent tell them apart: a mistyped reference, and a booking that
     * genuinely exists at the supplier but never reached this database — which is exactly
     * what happened with CG-770AZS, a real OTV reservation with no row here. So an unknown
     * reference is shown rather than refused, because refusing would block the one case an
     * Agent most needs to record.
     *
     * A link that resolves to nothing also carries no dates, so it contributes nothing to
     * Urgency. Silently, unless it is marked.
     */
    known: boolean;
}

/**
 * Does this booking reference belong to this user?
 *
 * Checked across both booking tables, because a reference names a sale and a sale is
 * either a stay or a flight.
 */
async function bookingBelongsTo(bookingReference: string, userId: string): Promise<boolean> {
    const sql = getSqlAdmin();
    const rows = await sql<{ ok: boolean }[]>`
        SELECT TRUE AS ok FROM bookings
         WHERE booking_reference = ${bookingReference} AND user_id = ${userId}
        UNION ALL
        SELECT TRUE AS ok FROM flight_bookings
         WHERE booking_reference = ${bookingReference} AND user_id = ${userId}
        LIMIT 1
    `;
    return rows.length > 0;
}

export interface LinkBookingInput {
    conversationId: string;
    bookingReference: string;
    /**
     * The Agent attaching it, or null when the customer is choosing their own trip.
     *
     * This is not only bookkeeping: it decides whether ownership is enforced. A customer
     * may only attach a booking that is theirs. An Agent may attach any booking, because an
     * Agent legitimately investigates a trip the customer is asking about but did not buy —
     * a companion's flight, a booking made by a colleague — and refusing that would make
     * the field useless in exactly the cases that need it most.
     */
    linkedBy: string | null;
    /** The conversation's owner, required when the customer is the one linking. */
    customerUserId?: string | null;
}

/**
 * Attach a trip to a conversation. Idempotent: linking the same booking twice is not an
 * error, and the first link's attribution stands rather than being rewritten by the second.
 */
export async function linkBooking(input: LinkBookingInput): Promise<void> {
    const reference = input.bookingReference.trim().toUpperCase();
    if (!reference) throw new Error('A booking reference is required');

    if (!input.linkedBy) {
        // The customer is linking. Without this a customer could attach any reference they
        // could guess or had seen, and an Agent opening the chat would discuss a stranger's
        // trip in good faith, believing the system had vouched for it.
        if (!input.customerUserId) {
            throw new Error('Cannot link a booking on behalf of a customer with no account');
        }
        if (!(await bookingBelongsTo(reference, input.customerUserId))) {
            throw new Error('That booking does not belong to this customer');
        }
    }

    const sql = getSqlAdmin();
    await sql`
        INSERT INTO support_conversation_bookings (conversation_id, booking_reference, linked_by)
        VALUES (${input.conversationId}, ${reference}, ${input.linkedBy})
        ON CONFLICT (conversation_id, booking_reference) DO NOTHING
    `;
}

/** Detach a trip. Silent when it was not linked — the end state is what was asked for. */
export async function unlinkBooking(
    conversationId: string,
    bookingReference: string,
): Promise<void> {
    const sql = getSqlAdmin();
    await sql`
        DELETE FROM support_conversation_bookings
         WHERE conversation_id = ${conversationId}
           AND booking_reference = ${bookingReference.trim().toUpperCase()}
    `;
}

/**
 * The trips on one conversation, in the order they were attached.
 *
 * Each is checked against the booking tables so the screen can mark one that resolves to
 * nothing. Without it a mistyped reference is indistinguishable from a real trip: it sits
 * there looking attached, contributes no dates to Urgency, and the mistake surfaces only
 * when someone wonders why an imminent flight never raised the conversation in the queue.
 */
export async function listLinkedBookings(conversationId: string): Promise<LinkedBooking[]> {
    const sql = getSqlAdmin();
    return sql<LinkedBooking[]>`
        SELECT scb.booking_reference AS "bookingReference",
               scb.linked_by         AS "linkedBy",
               scb.linked_at         AS "linkedAt",
               EXISTS (
                   SELECT 1 FROM bookings b
                    WHERE b.booking_reference = scb.booking_reference
                   UNION ALL
                   SELECT 1 FROM flight_bookings fb
                    WHERE fb.booking_reference = scb.booking_reference
               ) AS known
          FROM support_conversation_bookings scb
         WHERE scb.conversation_id = ${conversationId}
         ORDER BY scb.linked_at ASC
    `;
}

/**
 * Every Support Chat that has ever named this trip, newest first.
 *
 * The reverse lookup, and the reason the reference is indexed: an Agent opening a disputed
 * booking wants to know what the customer has already been told about it, which is a
 * question about conversations, not about this trip's row.
 */
export async function conversationsForBooking(bookingReference: string): Promise<string[]> {
    const sql = getSqlAdmin();
    const rows = await sql<{ conversationId: string }[]>`
        SELECT conversation_id AS "conversationId"
          FROM support_conversation_bookings
         WHERE booking_reference = ${bookingReference.trim().toUpperCase()}
         ORDER BY linked_at DESC
    `;
    return rows.map(r => r.conversationId);
}
