import { describe, it, expect, afterEach, vi } from 'vitest';

/**
 * `flight_bookings.ticket_numbers` is `text[]`. The row is written with
 * `ticket_numbers = ${JSON.stringify(tickets)}` — the parameter Postgres receives is the
 * STRING `'["0797586589419"]'`, not an array, and `[...]` is not valid Postgres array-literal
 * syntax (`{...}` is). Every real call failed:
 *
 *   malformed array literal: "["0797586589419"]"
 *
 * postgres.js serialises a plain JS array into a `text[]` parameter correctly on its own —
 * the fix is to stop stringifying and pass `tickets` itself.
 *
 * Integration rather than unit: the defect is in what Postgres does with a bound parameter,
 * which a mocked `sql` tagged template would just echo back without ever proving anything.
 * Skips when no database is reachable, matching the sibling `*.integration.test.ts` files.
 */

async function databaseReachable(): Promise<boolean> {
    if (!process.env.DATABASE_URL) return false;
    try {
        const { getSqlAdmin } = await import('@/lib/db/postgres');
        await getSqlAdmin()`SELECT 1`;
        return true;
    } catch {
        return false;
    }
}

async function sql() {
    const { getSqlAdmin } = await import('@/lib/db/postgres');
    return getSqlAdmin();
}

const createdBookingIds: string[] = [];

/** A `flight_bookings` row in `awaiting_ticket`, holding a real Duffel order id to fetch. */
async function makeAwaitingTicketBooking(duffelOrderId: string): Promise<string> {
    const db = await sql();
    const [user] = await db`SELECT id FROM users LIMIT 1`;
    const [row] = await db`
        INSERT INTO flight_bookings (user_id, pnr, provider, total_price, currency, status, duffel_order_id)
        VALUES (${user.id}, ${'TESTPNR'}, ${'duffel'}, ${100}, ${'USD'}, ${'awaiting_ticket'}, ${duffelOrderId})
        RETURNING id
    `;
    createdBookingIds.push(row.id);
    return row.id;
}

/** A Duffel GET /air/orders/:id response carrying the given electronic-ticket identifiers. */
function duffelOrderResponse(ticketIdentifiers: string[]) {
    return new Response(JSON.stringify({
        data: {
            slices: [],
            passengers: [],
            documents: ticketIdentifiers.map((id) => ({ type: 'electronic_ticket', unique_identifier: id })),
        },
    }), { status: 200 });
}

afterEach(async () => {
    vi.unstubAllGlobals();
    if (createdBookingIds.length) {
        const db = await sql();
        await db`DELETE FROM flight_bookings WHERE id = ANY(${createdBookingIds})`;
        createdBookingIds.length = 0;
    }
});

describe('issueTicket — writing ticket_numbers', () => {
    it('records a single-digit ticket identifier instead of throwing on it', async (ctx) => {
        if (!(await databaseReachable())) return ctx.skip();
        // "1" is what a Duffel sandbox order's unique_identifier looks like — short enough
        // that JSON.stringify(['1']) === '["1"]', the exact string that was seen failing.
        const bookingId = await makeAwaitingTicketBooking('ord_test_single_ticket');
        vi.stubGlobal('fetch', vi.fn(async () => duffelOrderResponse(['1'])));

        const { issueTicket } = await import('./issue-ticket');
        const result = await issueTicket(bookingId);

        expect(result).toMatchObject({ success: true, ticketStatus: 'ticketed', ticketCount: 1 });

        const db = await sql();
        const [row] = await db`SELECT ticket_numbers FROM flight_bookings WHERE id = ${bookingId}`;
        expect(row.ticket_numbers).toEqual(['1']);
    });

    it('records more than one ticket identifier', async (ctx) => {
        if (!(await databaseReachable())) return ctx.skip();
        const bookingId = await makeAwaitingTicketBooking('ord_test_multi_ticket');
        vi.stubGlobal('fetch', vi.fn(async () => duffelOrderResponse(['1234567890123', '9876543210987'])));

        const { issueTicket } = await import('./issue-ticket');
        const result = await issueTicket(bookingId);

        expect(result).toMatchObject({ success: true, ticketStatus: 'ticketed', ticketCount: 2 });

        const db = await sql();
        const [row] = await db`SELECT ticket_numbers FROM flight_bookings WHERE id = ${bookingId}`;
        expect(row.ticket_numbers).toEqual(['1234567890123', '9876543210987']);
    });

    it('leaves ticket_numbers a real empty array, not null, when the order has no e-tickets yet', async (ctx) => {
        if (!(await databaseReachable())) return ctx.skip();
        const bookingId = await makeAwaitingTicketBooking('ord_test_no_tickets');
        vi.stubGlobal('fetch', vi.fn(async () => duffelOrderResponse([])));

        const { issueTicket } = await import('./issue-ticket');
        const result = await issueTicket(bookingId);

        expect(result).toMatchObject({ success: true, ticketStatus: 'awaiting_ticket', ticketCount: 0 });

        const db = await sql();
        const [row] = await db`SELECT ticket_numbers FROM flight_bookings WHERE id = ${bookingId}`;
        expect(row.ticket_numbers).toEqual([]);
    });
});
