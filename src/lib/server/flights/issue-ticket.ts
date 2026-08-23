/**
 * Turn a Duffel order's issued e-tickets into a ticketed booking.
 *
 * For bookings in `awaiting_ticket`, this fetches the Duffel order, extracts any
 * electronic tickets, moves `flight_bookings.status` to `ticketed` and writes the ticket
 * numbers onto the passenger rows.
 *
 * Was `functions/v1/issue-ticket` on Supabase, then `/api/internal/issue-ticket`. Every
 * caller runs in this process, so the loopback request between them bought nothing but a
 * round trip on the path that confirms a paid booking. See ADR-0012. The route remains as
 * a thin HTTP wrapper.
 */

import { createAdminClient } from '@/utils/postgres/admin';
import { getSqlAdmin } from '@/lib/db/postgres';
import { env } from '@/utils/env';

export interface IssueTicketResult {
    success: boolean;
    ticketStatus?: string;
    ticketCount?: number;
    error?: string;
    /** What the HTTP wrapper should answer. 200 unless stated. */
    httpStatus?: number;
}

export async function issueTicket(bookingId: string): Promise<IssueTicketResult> {
    if (!bookingId) {
        return { success: false, error: 'bookingId is required', httpStatus: 400 };
    }

    const db = createAdminClient();
    const sql = getSqlAdmin();

    try {
        // ── Read the booking ─────────────────────────────────────────────
        const { data: booking, error: fetchErr } = await db
            .from('flight_bookings')
            .select('id, provider, duffel_order_id, status, pnr')
            .eq('id', bookingId)
            .maybeSingle();

        if (fetchErr || !booking) {
            return { success: false, error: fetchErr?.message ?? 'Booking not found', httpStatus: 404 };
        }

        // ── Already ticketed ─────────────────────────────────────────────
        if (booking.status === 'ticketed') {
            console.log(`[issue-ticket] Booking ${bookingId} already ticketed — idempotent return`);
            return { success: true, ticketStatus: 'ticketed' };
        }

        // ── Only handle Duffel ───────────────────────────────────────────
        if (booking.provider !== 'duffel') {
            console.log(`[issue-ticket] Non-Duffel booking ${bookingId} (${booking.provider}) — nothing to do`);
            return { success: true, ticketStatus: booking.status };
        }

        const orderId: string = (booking as any).duffel_order_id ?? '';

        if (!orderId) {
            console.error(`[issue-ticket] Booking ${bookingId} has no duffel_order_id`);
            return { success: false, error: 'No Duffel order ID on this booking', httpStatus: 400 };
        }

        const duffelToken = env.DUFFEL_TOKEN;
        if (!duffelToken) {
            return { success: false, error: 'Duffel not configured', httpStatus: 503 };
        }

        // ── Fetch the Duffel order ───────────────────────────────────────
        console.log(`[issue-ticket] Fetching Duffel order ${orderId} for booking ${bookingId}`);

        const orderRes = await fetch(`https://api.duffel.com/air/orders/${orderId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${duffelToken}`,
                'Duffel-Version': 'v2',
                'Content-Type': 'application/json',
            },
            signal: AbortSignal.timeout(15_000),
        });

        if (!orderRes.ok) {
            const errData = await orderRes.json().catch(() => ({}));
            const errMsg = errData?.errors?.[0]?.message ?? `Duffel order fetch failed (HTTP ${orderRes.status})`;
            console.error(`[issue-ticket] Duffel GET order failed: ${errMsg}`);
            return { success: false, error: errMsg, httpStatus: orderRes.status };
        }

        const orderData = await orderRes.json();
        const order = orderData.data;

        // Extract e-ticket numbers from order documents
        const tickets: string[] = (order.documents ?? [])
            .filter((d: any) => d.type === 'electronic_ticket')
            .map((d: any) => d.unique_identifier as string);

        const isTicketed = tickets.length > 0;
        const newStatus = isTicketed ? 'ticketed' : 'awaiting_ticket';

        console.log(`[issue-ticket] Order ${orderId}: ${tickets.length} tickets — status → ${newStatus}`);

        // ── Update flight_bookings ───────────────────────────────────────
        await sql`
            UPDATE flight_bookings
            SET
                status = ${newStatus},
                ticket_numbers = ${JSON.stringify(tickets)}
            WHERE id = ${bookingId}
        `;

        // ── Update passenger ticket_numbers ──────────────────────────────
        if (tickets.length > 0) {
            // Fetch passengers in insertion order
            const passengerRows = await sql`
                SELECT id FROM passengers
                WHERE booking_id = ${bookingId}
                ORDER BY created_at ASC
            `;

            for (let i = 0; i < passengerRows.length; i++) {
                const ticketNum = tickets[i] ?? null;
                if (ticketNum) {
                    await sql`
                        UPDATE passengers
                        SET ticket_number = ${ticketNum}
                        WHERE id = ${passengerRows[i].id}
                    `;
                }
            }
        }

        return { success: true, ticketStatus: newStatus, ticketCount: tickets.length };

    } catch (err: any) {
        console.error('[issue-ticket] Unhandled error:', err);
        return { success: false, error: err.message ?? 'Internal server error', httpStatus: 500 };
    }
}
