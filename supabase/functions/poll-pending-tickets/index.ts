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
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';

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
        .select('id, pnr, provider, payment_intent_id, ticket_time_limit, status, session_id, total_price, currency')
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
        .select('id, pnr, payment_intent_id, session_id, total_price, currency')
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

                // Email 2A: notify passenger their e-ticket is now issued
                sendTicketIssuedEmail(booking, data, supabase, RESEND_API_KEY)
                    .catch(e => console.error('[poll-pending-tickets] Ticket-issued email error:', e));

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
    booking: { id: string; pnr: string; payment_intent_id: string | null; session_id?: string | null; total_price?: number; currency?: string },
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

    let refundId: string | undefined;

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
            refundId = refundData.id;
            console.log(`[poll-pending-tickets] Refund issued for booking ${booking.id}: ${refundData.id}`);
        } else {
            console.error(`[poll-pending-tickets] Stripe refund failed for booking ${booking.id}:`, refundData);
        }
    } catch (err) {
        console.error(`[poll-pending-tickets] Stripe refund error for booking ${booking.id}:`, err);
    }

    // Email 2B: notify passenger of refund
    if (booking.session_id) {
        sendRefundEmail(booking, supabase, RESEND_API_KEY, refundId)
            .catch(e => console.error('[poll-pending-tickets] Refund email error:', e));
    }
}

// ─── Email Helpers (inline Resend calls — edge function can't import from Next.js) ─

async function getContactAndSegments(booking: { id: string; session_id?: string | null }, supabase: ReturnType<typeof createClient>) {
    const [sessionRes, segmentsRes] = await Promise.all([
        booking.session_id
            ? supabase.from('booking_sessions').select('contact, passengers').eq('id', booking.session_id).single()
            : Promise.resolve({ data: null }),
        supabase.from('flight_segments').select('*').eq('booking_id', booking.id),
    ]);
    const email: string = (sessionRes.data as any)?.contact?.email ?? '';
    const pax0 = (sessionRes.data as any)?.passengers?.[0];
    const passengerName: string = pax0 ? `${pax0.firstName} ${pax0.lastName}` : 'Traveler';
    const segments: any[] = segmentsRes.data ?? [];
    return { email, passengerName, segments };
}

async function sendTicketIssuedEmail(
    booking: { id: string; pnr: string; session_id?: string | null; total_price?: number; currency?: string },
    rawData: any,
    supabase: ReturnType<typeof createClient>,
    resendKey: string,
): Promise<void> {
    if (!resendKey) return;
    const { email, passengerName, segments } = await getContactAndSegments(booking, supabase);
    if (!email) return;

    const formattedPrice = new Intl.NumberFormat('en-US', { style: 'currency', currency: booking.currency || 'USD' }).format(booking.total_price ?? 0);
    const firstSeg = segments[0];
    const lastSeg = segments[segments.length - 1];
    const route = firstSeg && lastSeg ? `${firstSeg.origin} → ${lastSeg.destination}` : 'N/A';

    // Build e-ticket numbers list if available
    const ticketNumbers: string[] = [
        ...(rawData?.TktNumbers ?? []),
        ...(rawData?.ETicketNumbers ?? []),
    ].map(String).filter(Boolean);
    const ticketHtml = ticketNumbers.length > 0
        ? `<div style="background:#f0fdf4;padding:15px;border-radius:8px;margin:20px 0;border-left:4px solid #22c55e;"><p style="margin:0;color:#14532d;font-size:14px;"><strong>E-Ticket Numbers:</strong><br>${ticketNumbers.map(t => `<span style="font-family:monospace;font-weight:700;">${t}</span>`).join('<br>')}</p></div>`
        : '';

    const segRows = segments.map((s: any) => {
        const dep = new Date(s.departure).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
        const arr = new Date(s.arrival).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
        return `<tr><td style="padding:10px;border-bottom:1px solid #e5e7eb;"><strong>${s.airline}</strong><br><span style="color:#6b7280;font-size:13px;">${s.flight_number}</span></td><td style="padding:10px;border-bottom:1px solid #e5e7eb;"><strong>${s.origin}</strong><br><span style="color:#6b7280;font-size:13px;">${dep}</span></td><td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:center;color:#9ca3af;">→</td><td style="padding:10px;border-bottom:1px solid #e5e7eb;"><strong>${s.destination}</strong><br><span style="color:#6b7280;font-size:13px;">${arr}</span></td></tr>`;
    }).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>E-Ticket Issued</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;">
<div style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);padding:30px;border-radius:12px 12px 0 0;text-align:center;">
  <h1 style="color:white;margin:0;font-size:28px;">🎉 E-Ticket Issued!</h1>
  <p style="color:rgba(255,255,255,0.9);margin:10px 0 0 0;">${route}</p>
</div>
<div style="background:#fff;padding:30px;border:1px solid #e5e7eb;border-top:none;">
  <p>Dear <strong>${passengerName}</strong>,</p>
  <p>Great news! Your e-ticket has been issued. Your booking is fully confirmed.</p>
  <div style="background:#f9fafb;padding:20px;border-radius:8px;margin:20px 0;">
    <table style="width:100%;border-collapse:collapse;">
      <tr><td style="padding:8px 0;color:#6b7280;">PNR:</td><td style="padding:8px 0;font-weight:700;font-family:monospace;font-size:18px;color:#4f46e5;">${booking.pnr}</td></tr>
      <tr style="border-top:1px solid #e5e7eb;"><td style="padding:12px 0 8px 0;color:#6b7280;font-weight:600;">Total Paid:</td><td style="padding:12px 0 8px 0;font-weight:700;font-size:18px;color:#059669;">${formattedPrice}</td></tr>
    </table>
  </div>
  ${ticketHtml}
  <div style="margin:20px 0;"><h3 style="margin:0 0 10px 0;font-size:16px;color:#374151;">Flight Itinerary</h3><table style="width:100%;border-collapse:collapse;">${segRows}</table></div>
  <div style="background:#eef2ff;padding:15px;border-radius:8px;border-left:4px solid #4f46e5;"><p style="margin:0;color:#3730a3;font-size:14px;"><strong>Important:</strong><br>Please save your PNR (<strong>${booking.pnr}</strong>) for check-in. Arrive at least 2 hours before domestic or 3 hours before international flights.</p></div>
</div>
<div style="background:#f9fafb;padding:20px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none;text-align:center;"><p style="margin:0;color:#9ca3af;font-size:12px;">This email was sent by CheapestGo<br>&copy; ${new Date().getFullYear()} All rights reserved</p></div>
</body></html>`;

    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: 'CheapestGo <no-reply@mail.cheapestgo.com>', to: [email], subject: `E-Ticket Issued ✅ – ${route} (PNR ${booking.pnr})`, html }),
    });
    console.log(`[poll-pending-tickets] Ticket-issued email → ${email}: ${res.status}`);
}

async function sendRefundEmail(
    booking: { id: string; pnr: string; session_id?: string | null; total_price?: number; currency?: string },
    supabase: ReturnType<typeof createClient>,
    resendKey: string,
    refundId?: string,
): Promise<void> {
    if (!resendKey) return;
    const { email, passengerName, segments } = await getContactAndSegments(booking, supabase);
    if (!email) return;

    const formattedPrice = new Intl.NumberFormat('en-US', { style: 'currency', currency: booking.currency || 'USD' }).format(booking.total_price ?? 0);
    const firstSeg = segments[0];
    const lastSeg = segments[segments.length - 1];
    const route = firstSeg && lastSeg ? `${firstSeg.origin} → ${lastSeg.destination}` : 'N/A';

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Refund Initiated</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;">
<div style="background:linear-gradient(135deg,#475569 0%,#334155 100%);padding:30px;border-radius:12px 12px 0 0;text-align:center;">
  <h1 style="color:white;margin:0;font-size:28px;">Booking Update</h1>
  <p style="color:rgba(255,255,255,0.85);margin:10px 0 0 0;">Refund Initiated — ${route}</p>
</div>
<div style="background:#fff;padding:30px;border:1px solid #e5e7eb;border-top:none;">
  <p>Dear <strong>${passengerName}</strong>,</p>
  <p>We're sorry — the airline was unable to confirm the e-ticket for your booking <strong>${booking.pnr}</strong> (${route}). A <strong>full refund of ${formattedPrice}</strong> has been initiated.</p>
  <div style="background:#f9fafb;padding:20px;border-radius:8px;margin:20px 0;">
    <table style="width:100%;border-collapse:collapse;">
      <tr><td style="padding:8px 0;color:#6b7280;">PNR:</td><td style="padding:8px 0;font-weight:700;font-family:monospace;">${booking.pnr}</td></tr>
      ${refundId ? `<tr><td style="padding:8px 0;color:#6b7280;">Refund ID:</td><td style="padding:8px 0;font-family:monospace;font-size:13px;">${refundId}</td></tr>` : ''}
      <tr style="border-top:1px solid #e5e7eb;"><td style="padding:12px 0 8px 0;color:#6b7280;font-weight:600;">Refund Amount:</td><td style="padding:12px 0 8px 0;font-weight:700;font-size:18px;color:#4f46e5;">${formattedPrice}</td></tr>
    </table>
  </div>
  <div style="background:#fef2f2;padding:15px;border-radius:8px;border-left:4px solid #ef4444;"><p style="margin:0;color:#991b1b;font-size:14px;"><strong>When will I see my refund?</strong><br>Refunds typically appear within <strong>5–10 business days</strong>. If not received after 10 days, contact your bank with the Refund ID above.</p></div>
  <p style="margin:20px 0 0 0;color:#6b7280;font-size:14px;">We apologize for the inconvenience. You're welcome to search for alternative flights.</p>
</div>
<div style="background:#f9fafb;padding:20px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none;text-align:center;"><p style="margin:0;color:#9ca3af;font-size:12px;">This email was sent by CheapestGo<br>&copy; ${new Date().getFullYear()} All rights reserved</p></div>
</body></html>`;

    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: 'CheapestGo <no-reply@mail.cheapestgo.com>', to: [email], subject: `Refund Initiated – ${route} (PNR ${booking.pnr})`, html }),
    });
    console.log(`[poll-pending-tickets] Refund email → ${email}: ${res.status}`);
}
