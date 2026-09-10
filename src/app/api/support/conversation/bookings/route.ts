import { NextRequest, NextResponse } from 'next/server';
import { getSqlAdmin } from '@/lib/db/postgres';
import {
    findConversation,
    getSupportCaller,
} from '@/lib/server/support/conversations';
import {
    linkBooking,
    unlinkBooking,
    listLinkedBookings,
} from '@/lib/server/support/linked-bookings';

export const dynamic = 'force-dynamic';

/**
 * The customer choosing which of their trips this Support Chat is about.
 *
 * Signed-in only, and not because linking is sensitive — because there is nothing to offer
 * otherwise. A caller with no account has no bookings we can prove are theirs, and the
 * alternative, letting someone type a reference, is the one thing this route must not
 * allow: an Agent would then discuss a stranger's trip in good faith, believing the system
 * had vouched for it. `linkBooking` enforces ownership on this path; the Agent's route
 * deliberately does not, because an Agent legitimately investigates a companion's flight.
 */

interface TripOption {
    bookingReference: string;
    kind: 'stay' | 'flight';
    label: string;
    startsAt: string | null;
}

/** The caller's own trips, soonest first, for the picker to show. */
export async function GET() {
    const caller = await getSupportCaller();
    if (!caller.userId) return NextResponse.json({ trips: [], linked: [] });

    const conversation = await findConversation(caller);
    const sql = getSqlAdmin();

    // Only what a person needs to recognise their own trip. A support widget is not a
    // booking screen, and pulling whole rows here would put a customer's full itinerary
    // into a payload that exists to render four words and a date.
    const trips = await sql<TripOption[]>`
        SELECT booking_reference AS "bookingReference",
               'stay'            AS kind,
               COALESCE(property_name, 'Hotel booking') AS label,
               check_in::timestamptz AS "startsAt"
          FROM bookings
         WHERE user_id = ${caller.userId} AND booking_reference IS NOT NULL
        UNION ALL
        SELECT fb.booking_reference AS "bookingReference",
               'flight'             AS kind,
               COALESCE(
                   MIN(fs.origin) || ' → ' || MAX(fs.destination),
                   'Flight booking'
               ) AS label,
               MIN(fs.departure) AS "startsAt"
          FROM flight_bookings fb
          LEFT JOIN flight_segments fs ON fs.booking_id = fb.id
         WHERE fb.user_id = ${caller.userId} AND fb.booking_reference IS NOT NULL
         GROUP BY fb.booking_reference
        -- Soonest first, and trips with no date last: the one the customer is about to take
        -- is the one they are most likely writing about.
         ORDER BY "startsAt" ASC NULLS LAST
         LIMIT 20
    `;

    const linked = conversation ? await listLinkedBookings(conversation.id) : [];
    return NextResponse.json({ trips, linked });
}

export async function POST(req: NextRequest) {
    const caller = await getSupportCaller();
    if (!caller.userId) {
        return NextResponse.json({ error: 'Sign in to link a booking' }, { status: 401 });
    }

    const conversation = await findConversation(caller);
    if (!conversation) return NextResponse.json({ error: 'No conversation' }, { status: 404 });

    const body = (await req.json().catch(() => null)) as { bookingReference?: unknown } | null;
    const reference =
        typeof body?.bookingReference === 'string' ? body.bookingReference.trim() : '';
    if (!reference) {
        return NextResponse.json({ error: 'A booking reference is required' }, { status: 400 });
    }

    try {
        await linkBooking({
            conversationId: conversation.id,
            bookingReference: reference,
            // Null marks this as the customer's own choice rather than an Agent's, which is
            // also what makes `linkBooking` check that the trip is theirs.
            linkedBy: null,
            customerUserId: caller.userId,
        });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Could not link that booking' },
            { status: 400 },
        );
    }

    return NextResponse.json({ linked: await listLinkedBookings(conversation.id) }, { status: 201 });
}

/** Undo a choice. The customer may only detach from their own conversation. */
export async function DELETE(req: NextRequest) {
    const caller = await getSupportCaller();
    const conversation = await findConversation(caller);
    if (!conversation) return NextResponse.json({ error: 'No conversation' }, { status: 404 });

    const reference = req.nextUrl.searchParams.get('bookingReference');
    if (!reference) {
        return NextResponse.json({ error: 'bookingReference is required' }, { status: 400 });
    }

    await unlinkBooking(conversation.id, reference);
    return NextResponse.json({ linked: await listLinkedBookings(conversation.id) });
}
