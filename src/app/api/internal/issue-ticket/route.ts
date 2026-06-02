/**
 * POST /api/internal/issue-ticket
 *
 * Replaces the Supabase Edge Function `functions/v1/issue-ticket`.
 *
 * For Duffel bookings that are in status 'awaiting_ticket', this endpoint
 * fetches the Duffel order and extracts any issued e-tickets, then updates
 * flight_bookings.status to 'ticketed' and writes ticket numbers into the
 * passengers rows.
 *
 * Auth: Authorization: Bearer <FUNCTIONS_SECRET>
 *
 * Request body: { bookingId: string }
 * Response:     { success: true, ticketStatus: string }
 *             | { success: false, error: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/postgres/admin';
import { getSqlAdmin } from '@/lib/db/postgres';
import { env } from '@/utils/env';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ── Auth helper ──────────────────────────────────────────────────────────────

function checkAuth(req: NextRequest): boolean {
    const secret = process.env.FUNCTIONS_SECRET;
    if (!secret) {
        console.warn('[issue-ticket] FUNCTIONS_SECRET not set — allowing request (dev mode)');
        return true;
    }
    const authHeader = req.headers.get('authorization') ?? '';
    return authHeader === `Bearer ${secret}`;
}

// ── Main handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
    if (!checkAuth(req)) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    let body: { bookingId?: string };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    const { bookingId } = body;

    if (!bookingId) {
        return NextResponse.json({ success: false, error: 'bookingId is required' }, { status: 400 });
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
            return NextResponse.json(
                { success: false, error: fetchErr?.message ?? 'Booking not found' },
                { status: 404 },
            );
        }

        // ── Already ticketed ─────────────────────────────────────────────
        if (booking.status === 'ticketed') {
            console.log(`[issue-ticket] Booking ${bookingId} already ticketed — idempotent return`);
            return NextResponse.json({ success: true, ticketStatus: 'ticketed' });
        }

        // ── Only handle Duffel ───────────────────────────────────────────
        if (booking.provider !== 'duffel') {
            console.log(`[issue-ticket] Non-Duffel booking ${bookingId} (${booking.provider}) — nothing to do`);
            return NextResponse.json({ success: true, ticketStatus: booking.status });
        }

        const orderId: string = (booking as any).duffel_order_id ?? '';

        if (!orderId) {
            console.error(`[issue-ticket] Booking ${bookingId} has no duffel_order_id`);
            return NextResponse.json(
                { success: false, error: 'No Duffel order ID on this booking' },
                { status: 400 },
            );
        }

        const duffelToken = env.DUFFEL_TOKEN;
        if (!duffelToken) {
            return NextResponse.json({ success: false, error: 'Duffel not configured' }, { status: 503 });
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
            return NextResponse.json({ success: false, error: errMsg }, { status: orderRes.status });
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

        return NextResponse.json({
            success: true,
            ticketStatus: newStatus,
            ticketCount: tickets.length,
        });

    } catch (err: any) {
        console.error('[issue-ticket] Unhandled error:', err);
        return NextResponse.json(
            { success: false, error: err.message ?? 'Internal server error' },
            { status: 500 },
        );
    }
}
