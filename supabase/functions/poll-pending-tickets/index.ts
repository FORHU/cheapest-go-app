/**
 * poll-pending-tickets - Supabase Edge Function
 *
 * STEP 8: Background polling for Mystifly ticket confirmation.
 * - If ticketed: update booking status to 'ticketed'
 * - If failed or time expired: auto refund Stripe, update to 'failed'
 *
 * Schedule via pg_cron (run in Supabase SQL editor):
 *   SELECT cron.schedule(
 *     'poll-pending-tickets',
 *     'every 5 minutes',
 *     'SELECT net.http_post(url, body, content_type) FROM net'
 *   );
 *
 * Or call manually:
 *   curl -X POST .../functions/v1/poll-pending-tickets
 *          -H "Authorization: Bearer <service_role_key>"
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

declare const Deno: any;

const MYSTIFLY_BASE_URL = Deno.env.get('MYSTIFLY_BASE_URL') ?? 'https://uat.mystifly.com/api/api';
const MYSTIFLY_USERNAME = Deno.env.get('MYSTIFLY_USERNAME') ?? '';
const MYSTIFLY_PASSWORD = Deno.env.get('MYSTIFLY_PASSWORD') ?? '';
const MYSTIFLY_TENANT_ID = Deno.env.get('MYSTIFLY_TENANT_ID') ?? '';
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? '';

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
        return new Response(JSON.stringify({ success: false, error: 'Supabase env vars missing' }), { status: 500 });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // ── 1. Find all awaiting_ticket bookings that have not expired ──
    const now = new Date().toISOString();
    const { data: pendingBookings, error: fetchError } = await supabase
        .from('flight_bookings')
        .select('id, pnr, provider, payment_intent_id, ticket_time_limit, status')
        .eq('status', 'awaiting_ticket')
        .or(`ticket_time_limit.is.null,ticket_time_limit.gt.${now}`)
        .limit(50);

    if (fetchError) {
        console.error('[poll-pending-tickets] Failed to fetch:', fetchError);
        return new Response(JSON.stringify({ success: false, error: fetchError.message }), { status: 500 });
    }

    // ── 2. Also detect expired time limits and refund automatically ──
    const { data: expiredBookings } = await supabase
        .from('flight_bookings')
        .select('id, pnr, payment_intent_id')
        .eq('status', 'awaiting_ticket')
        .lt('ticket_time_limit', now);

    if (expiredBookings && expiredBookings.length > 0) {
        console.log(`[poll-pending-tickets] ${expiredBookings.length} booking(s) with expired time limits — refunding...`);
        for (const expired of expiredBookings) {
            await handleRefund(expired, supabase);
        }
    }

    if (!pendingBookings || pendingBookings.length === 0) {
        return new Response(JSON.stringify({ success: true, processed: 0, message: 'No pending tickets' }), { status: 200 });
    }

    console.log(`[poll-pending-tickets] Checking ${pendingBookings.length} pending booking(s)...`);

    // ── 3. Get a Mystifly session token ──
    let mystiflyToken: string | null = null;
    try {
        const authRes = await fetch(`${MYSTIFLY_BASE_URL}/Authenticate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                UserName: MYSTIFLY_USERNAME,
                Password: MYSTIFLY_PASSWORD,
                TenantId: MYSTIFLY_TENANT_ID,
            }),
        });
        const authData = await authRes.json();
        mystiflyToken = authData.Data?.SessionId ?? authData.SessionId ?? authData.Token ?? null;
    } catch (e) {
        console.error('[poll-pending-tickets] Mystifly auth failed:', e);
        return new Response(JSON.stringify({ success: false, error: 'Mystifly auth failed' }), { status: 500 });
    }

    const results = { ticketed: 0, failed: 0, unchanged: 0 };

    // ── 4. Poll each pending booking ──
    for (const booking of pendingBookings) {
        if (booking.provider !== 'mystifly' && booking.provider !== 'mystifly_v2') {
            results.unchanged++;
            continue;
        }

        try {
            const retrieveRes = await fetch(`${MYSTIFLY_BASE_URL}/RetrieveBooking`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    UniqueID: booking.pnr,
                    SessionId: mystiflyToken,
                }),
            });

            const retrieveData = await retrieveRes.json();
            const data = retrieveData.Data ?? {};
            const ticketStatus = String(data.TicketStatus ?? data.Status ?? '').toLowerCase();

            console.log(`[poll-pending-tickets] PNR: ${booking.pnr} TicketStatus: ${ticketStatus}`);

            const hasTickets = data.TktNumbers?.length > 0 || data.ETicketNumbers?.length > 0;

            if (ticketStatus === 'ticketed' || hasTickets) {
                // STEP 8: Ticket issued successfully — update DB
                await supabase
                    .from('flight_bookings')
                    .update({ status: 'ticketed' })
                    .eq('id', booking.id);

                console.log(`[poll-pending-tickets] Booking ${booking.id} (PNR: ${booking.pnr}) is now TICKETED`);
                results.ticketed++;
                // TODO: Send confirmation email here

            } else if (['failed', 'cancelled', 'error', 'voided'].includes(ticketStatus)) {
                // STEP 8: Ticketing failed — refund the customer automatically
                console.log(`[poll-pending-tickets] Booking ${booking.id} ticketing failed (${ticketStatus}) — refunding`);
                await handleRefund(booking, supabase);
                results.failed++;

            } else {
                // Still pending, check again next cycle
                results.unchanged++;
            }
        } catch (err) {
            console.error(`[poll-pending-tickets] Error checking booking ${booking.id}:`, err);
            results.unchanged++;
        }
    }

    console.log('[poll-pending-tickets] Done:', results);

    return new Response(JSON.stringify({
        success: true,
        processed: pendingBookings.length,
        ...results,
    }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
});

/**
 * STEP 8: Ticketing failed or time limit expired.
 * Trigger automatic Stripe refund and mark booking as failed.
 */
async function handleRefund(
    booking: { id: string; pnr: string; payment_intent_id: string | null },
    supabase: ReturnType<typeof createClient>,
): Promise<void> {
    await supabase
        .from('flight_bookings')
        .update({ status: 'failed' })
        .eq('id', booking.id);

    if (!booking.payment_intent_id || !STRIPE_SECRET_KEY) {
        console.warn(`[poll-pending-tickets] No payment_intent_id for booking ${booking.id} — cannot auto-refund`);
        return;
    }

    try {
        const body = new URLSearchParams();
        body.set('payment_intent', booking.payment_intent_id);

        const refundRes = await fetch('https://api.stripe.com/v1/refunds', {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${btoa(STRIPE_SECRET_KEY + ':')}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: body.toString(),
        });

        const refundData = await refundRes.json();

        if (refundData.id) {
            console.log(`[poll-pending-tickets] Refund issued for booking ${booking.id}: ${refundData.id}`);
        } else {
            console.error(`[poll-pending-tickets] Stripe refund failed for booking ${booking.id}:`, refundData);
        }
    } catch (err) {
        console.error(`[poll-pending-tickets] Stripe refund error for booking ${booking.id}:`, err);
    }
}
