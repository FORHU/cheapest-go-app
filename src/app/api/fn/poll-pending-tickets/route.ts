import { NextRequest, NextResponse } from 'next/server';
import { getSqlAdmin } from '@/lib/db/postgres';
import { adminCancelAwaitingTicket } from '@/lib/server/admin/recovery';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes max

function checkAuth(req: NextRequest): boolean {
    const secret = process.env.FUNCTIONS_SECRET || process.env.INTERNAL_SECRET;
    if (!secret) {
        console.warn('[poll-pending-tickets] FUNCTIONS_SECRET/INTERNAL_SECRET not set — allowing request (dev mode)');
        return true;
    }
    const authHeader = req.headers.get('authorization') ?? '';
    return authHeader === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
    if (!checkAuth(req)) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const sql = getSqlAdmin();
    const results: any[] = [];

    try {
        // Find all awaiting_ticket bookings
        const pendingBookings = await sql`
            SELECT id, provider, ticket_time_limit, created_at
            FROM flight_bookings
            WHERE status = 'awaiting_ticket'
            ORDER BY created_at ASC
        `;

        console.log(`[poll-pending-tickets] Found ${pendingBookings.length} awaiting_ticket bookings.`);

        const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
        const functionsSecret = process.env.FUNCTIONS_SECRET || process.env.INTERNAL_SECRET;

        for (const booking of pendingBookings) {
            let currentStatus = 'awaiting_ticket';

            // 1. If Duffel booking, verify/trigger ticket issuance
            if (booking.provider === 'duffel') {
                try {
                    const ticketRes = await fetch(`${baseUrl}/api/internal/issue-ticket`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${functionsSecret}`,
                        },
                        body: JSON.stringify({ bookingId: booking.id }),
                    });

                    if (ticketRes.ok) {
                        const ticketData = await ticketRes.json();
                        if (ticketData?.success && ticketData?.ticketStatus) {
                            currentStatus = ticketData.ticketStatus;
                            console.log(`[poll-pending-tickets] Duffel booking ${booking.id} status updated to: ${currentStatus}`);
                        }
                    } else {
                        console.error(`[poll-pending-tickets] Failed calling /api/internal/issue-ticket for booking ${booking.id}: ${ticketRes.status}`);
                    }
                } catch (fetchErr: any) {
                    console.error(`[poll-pending-tickets] Error checking ticket status for Duffel booking ${booking.id}:`, fetchErr.message);
                }
            }

            // Re-fetch booking status if provider was duffel, to verify if it got ticketed
            if (booking.provider === 'duffel' && currentStatus === 'awaiting_ticket') {
                try {
                    const updatedBooking = await sql`
                        SELECT status FROM flight_bookings WHERE id = ${booking.id}
                    `;
                    if (updatedBooking.length > 0) {
                        currentStatus = updatedBooking[0].status;
                    }
                } catch (dbErr: any) {
                    console.error(`[poll-pending-tickets] Error reading status from DB for ${booking.id}:`, dbErr.message);
                }
            }

            // 2. Check if booking is expired and needs auto-refund
            const now = new Date();
            let isExpired = false;

            if (booking.ticket_time_limit) {
                isExpired = now > new Date(booking.ticket_time_limit);
            } else {
                // Fallback: expired after 24 hours of creation.
                // 1 hour was too aggressive — airline ticketing can legitimately take longer,
                // and Duffel's awaiting_ticket is normally resolved within minutes anyway.
                const createdTime = new Date(booking.created_at).getTime();
                isExpired = (now.getTime() - createdTime) > 24 * 60 * 60 * 1000;
            }

            if (currentStatus === 'awaiting_ticket' && isExpired) {
                console.log(`[poll-pending-tickets] Booking ${booking.id} is expired. Triggering auto-refund...`);
                try {
                    const refundResult = await adminCancelAwaitingTicket(booking.id);
                    results.push({
                        bookingId: booking.id,
                        action: 'refunded',
                        success: refundResult.success,
                        message: refundResult.message,
                    });
                } catch (refundErr: any) {
                    console.error(`[poll-pending-tickets] Error auto-refunding booking ${booking.id}:`, refundErr.message);
                    results.push({
                        bookingId: booking.id,
                        action: 'refund_failed',
                        success: false,
                        error: refundErr.message,
                    });
                }
            } else {
                results.push({
                    bookingId: booking.id,
                    status: currentStatus,
                    isExpired,
                });
            }
        }

        return NextResponse.json({ success: true, processed: results });
    } catch (err: any) {
        console.error('[poll-pending-tickets] Cron task failed:', err.message);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
