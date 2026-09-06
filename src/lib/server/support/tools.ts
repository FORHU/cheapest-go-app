import type { SupportTool } from './responder';

/**
 * What the support model may look up. All of it is read-only.
 *
 * Cancelling, amending and refunding are not here and will not be: those escalate to an
 * Agent by definition. The registry *is* the allow-list — the responder can only run what
 * this returns, so a tool that does not appear here is unreachable however the model asks.
 *
 * Everything is called in process (ADR-0012). The voice assistant's tool layer reaches the
 * app's own routes over HTTP with an address built from the incoming request; that is the
 * pattern ADR-0012 removed elsewhere, and it is not inherited here.
 */

/** A booking as the model is allowed to see it. */
export interface BookingSummary {
    reference: string | null;
    status: string | null;
    property: string | null;
    checkIn: string | null;
    checkOut: string | null;
    total: string | null;
}

function text(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value : null;
}

/**
 * Reduce booking rows to what a customer would ask about.
 *
 * An allow-list, not a redaction: fields are named in, never filtered out. A booking row
 * carries a payment intent, a supplier reference and an email address, and everything
 * returned here is a string the model may repeat to whoever is in the chat — so a row
 * passed through whole is a disclosure waiting for the right question.
 */
export function summariseBookings(rows: Array<Record<string, unknown>>): BookingSummary[] {
    return rows.map(row => {
        const amount = row.total_price;
        const currency = text(row.currency);

        return {
            reference: text(row.booking_reference),
            status: text(row.status),
            property: text(row.property_name),
            checkIn: text(row.check_in),
            checkOut: text(row.check_out),
            total: amount != null && currency ? `${amount} ${currency}` : null,
        };
    });
}

/**
 * The tools, built fresh per call so nothing caches a database client across requests.
 */
export function supportTools(): SupportTool[] {
    return [
        {
            name: 'get_bookings',
            description:
                "The signed-in customer's own bookings: reference, status, property, dates and total. Use this before answering anything about a specific trip.",
            parameters: { type: 'object', properties: {} },
            // ADR-0029. An email typed into the chat is a reply-to address, not proof of
            // who someone is, so this is offered only behind a Lucia session.
            requiresSession: true,
            async run(_args, context) {
                if (!context.userId) {
                    // Unreachable through the offer list, and checked anyway: a wiring bug
                    // upstream must not become a way to read a stranger's trips.
                    throw new Error('get_bookings needs a signed-in session');
                }

                const [{ getUserBookings }, { createAdminClient }] = await Promise.all([
                    import('@/lib/server/bookings'),
                    import('@/utils/postgres/admin'),
                ]);

                const result = await getUserBookings(
                    { id: context.userId } as Parameters<typeof getUserBookings>[0],
                    createAdminClient(),
                );

                const rows = (result as { data?: unknown }).data;
                return summariseBookings(Array.isArray(rows) ? rows : []);
            },
        },
    ];
}
