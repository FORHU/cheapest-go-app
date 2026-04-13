/**
 * poll-pending-tickets - Supabase Edge Function
 *
 * Polls awaiting_ticket Mystifly bookings and updates DB status when
 * Mystifly has issued the e-ticket on their side.
 *
 * Schedule via Supabase Dashboard → Edge Functions → Schedules,
 * or pg_cron every 5 minutes.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getTripDetails, ticketFlight } from "../_shared/mystiflyClient.ts";

declare const Deno: any;

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const SITE_URL = Deno.env.get('NEXT_PUBLIC_SITE_URL') ?? 'https://k-travel-booking.vercel.app';

// How long to wait before giving up and refunding (default 2 hours)
const TICKET_TIMEOUT_HOURS = 2;

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
    const now = new Date();

    // ── 1. Refund expired awaiting_ticket bookings ──────────────────
    const expiryThreshold = new Date(now.getTime() - TICKET_TIMEOUT_HOURS * 60 * 60 * 1000).toISOString();

    const { data: expiredBookings } = await supabase
        .from('flight_bookings')
        .select('id, pnr, payment_intent_id, session_id, total_price, currency')
        .eq('status', 'awaiting_ticket')
        .or(`ticket_time_limit.lt.${now.toISOString()},and(ticket_time_limit.is.null,created_at.lt.${expiryThreshold})`);

    if (expiredBookings && expiredBookings.length > 0) {
        console.log(`[poll-pending-tickets] ${expiredBookings.length} expired booking(s) — refunding`);
        for (const expired of expiredBookings) {
            await handleRefund(expired, supabase);
        }
    }

    // ── 2. Fetch active awaiting_ticket Mystifly bookings ───────────
    const { data: pendingBookings, error: fetchError } = await supabase
        .from('flight_bookings')
        .select('id, pnr, provider, payment_intent_id, session_id, total_price, currency')
        .eq('status', 'awaiting_ticket')
        .in('provider', ['mystifly', 'mystifly_v2'])
        .limit(50);

    if (fetchError) {
        console.error('[poll-pending-tickets] Failed to fetch:', fetchError);
        return new Response(JSON.stringify({ success: false, error: fetchError.message }), { status: 500 });
    }

    if (!pendingBookings || pendingBookings.length === 0) {
        return new Response(JSON.stringify({ success: true, processed: 0, message: 'No pending tickets' }), { status: 200 });
    }

    console.log(`[poll-pending-tickets] Checking ${pendingBookings.length} booking(s)…`);

    const results = { ticketed: 0, failed: 0, unchanged: 0 };

    // ── 3. Check each booking via TripDetails ───────────────────────
    for (const booking of pendingBookings) {
        if (!booking.pnr) { results.unchanged++; continue; }

        try {
            const raw = await getTripDetails(booking.pnr);

            // ── New structure: Data.TripDetailsResult.TravelItinerary ──
            const travelItin = raw?.Data?.TripDetailsResult?.TravelItinerary
                ?? raw?.Data?.TravelItinerary
                ?? raw?.TravelItinerary
                ?? null;

            // New structure: PassengerInfos[].ETickets[].ETicketNumber
            const passengerInfos: any[] = travelItin?.PassengerInfos ?? [];
            const eTicketsNew = passengerInfos
                .flatMap((p: any) => p?.ETickets ?? [])
                .map((t: any) => t?.ETicketNumber)
                .filter(Boolean);

            // Legacy structure: ItineraryInfo.CustomerInfos.CustomerInfo[].ETicketNumber
            const itinInfo = travelItin?.ItineraryInfo
                ?? raw?.Data?.ItineraryInfo
                ?? raw?.ItineraryInfo
                ?? null;
            const customers: any[] = itinInfo?.CustomerInfos?.CustomerInfo ?? [];
            const eTicketsLegacy = customers
                .map((c: any) => c.ETicketNumber)
                .filter(Boolean);

            const eTickets = eTicketsNew.length > 0 ? eTicketsNew : eTicketsLegacy;

            // Check ticket status from multiple possible fields
            const ticketStatus = String(
                travelItin?.TicketStatus ?? itinInfo?.ItineraryStatus ?? raw?.Data?.Status ?? ''
            ).toLowerCase();

            const isTicketed = eTickets.length > 0
                || ticketStatus === 'ticketed'
                || ticketStatus === 'confirmed';

            if (isTicketed) {
                await supabase
                    .from('flight_bookings')
                    .update({ status: 'ticketed' })
                    .eq('id', booking.id);

                // Update ticket_number on each passenger row
                if (passengerInfos.length > 0) {
                    for (const p of passengerInfos) {
                        const pax = p.Passenger ?? p;
                        const name = pax.PaxName ?? pax;
                        const eTicket = (p.ETickets ?? [])[0]?.ETicketNumber;
                        if (!eTicket) continue;
                        const firstName = (name.PassengerFirstName ?? '').toLowerCase();
                        const lastName = (name.PassengerLastName ?? '').toLowerCase();
                        await supabase
                            .from('passengers')
                            .update({ ticket_number: eTicket })
                            .eq('booking_id', booking.id)
                            .ilike('first_name', firstName)
                            .ilike('last_name', lastName);
                    }
                } else if (eTickets.length > 0) {
                    // Legacy: assign first eTicket to first passenger
                    await supabase
                        .from('passengers')
                        .update({ ticket_number: eTickets[0] })
                        .eq('booking_id', booking.id);
                }

                console.log(`[poll-pending-tickets] ✅ ${booking.pnr} is now TICKETED (eTickets: ${eTickets.join(', ')})`);
                results.ticketed++;

                sendTicketIssuedEmail(booking, eTickets, supabase)
                    .catch(e => console.error('[poll-pending-tickets] email error:', e));

            } else if (['failed', 'cancelled', 'voided', 'error'].includes(ticketStatus)) {
                console.log(`[poll-pending-tickets] ❌ ${booking.pnr} failed (${ticketStatus}) — refunding`);
                await handleRefund(booking, supabase);
                results.failed++;
            } else {
                // If TripDetails shows BookingStatus=Booked with no ticket yet, this is a
                // HoldAllowed (Private fare) booking where OrderTicket was never called or failed.
                // Retry OrderTicket now — it's idempotent and safe to call again.
                const bookingStatus = String(travelItin?.BookingStatus ?? '').toLowerCase();
                if (bookingStatus === 'booked' && !ticketStatus) {
                    console.log(`[poll-pending-tickets] 🎫 ${booking.pnr} is Booked but not ticketed — retrying OrderTicket`);
                    try {
                        const orderTicketRaw = await ticketFlight(booking.pnr);
                        if (orderTicketRaw.Success) {
                            console.log(`[poll-pending-tickets] ✅ OrderTicket succeeded for ${booking.pnr}`);
                            // Let next poll cycle pick up the ticket numbers via TripDetails
                        } else {
                            console.warn(`[poll-pending-tickets] OrderTicket failed for ${booking.pnr}: ${orderTicketRaw.Message}`);
                        }
                    } catch (otErr: any) {
                        console.warn(`[poll-pending-tickets] OrderTicket error for ${booking.pnr}: ${otErr.message}`);
                    }
                } else {
                    console.log(`[poll-pending-tickets] ⏳ ${booking.pnr} still pending (ticketStatus: ${ticketStatus}, bookingStatus: ${bookingStatus}, eTickets: ${eTickets.length})`);
                }
                results.unchanged++;
            }
        } catch (err: any) {
            // 404 from TripDetails = booking not found on Mystifly side yet
            if (err?.status === 404) {
                console.warn(`[poll-pending-tickets] ${booking.pnr} not found in Mystifly yet`);
                results.unchanged++;
            } else {
                console.error(`[poll-pending-tickets] Error checking ${booking.pnr}:`, err.message);
                results.unchanged++;
            }
        }
    }

    console.log('[poll-pending-tickets] Done:', results);

    return new Response(JSON.stringify({ success: true, processed: pendingBookings.length, ...results }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
});

// ─── Refund Helper ──────────────────────────────────────────────────

async function handleRefund(
    booking: { id: string; pnr: string; payment_intent_id: string | null; session_id?: string | null; total_price?: number; currency?: string },
    supabase: ReturnType<typeof createClient>,
): Promise<void> {
    await supabase.from('flight_bookings').update({ status: 'failed' }).eq('id', booking.id);

    if (!booking.payment_intent_id || !STRIPE_SECRET_KEY) {
        console.warn(`[poll-pending-tickets] No payment_intent_id for ${booking.id} — cannot auto-refund`);
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
            console.log(`[poll-pending-tickets] Refund issued for ${booking.id}: ${refundData.id}`);
        } else {
            console.error(`[poll-pending-tickets] Stripe refund failed for ${booking.id}:`, refundData);
        }
    } catch (err: any) {
        console.error(`[poll-pending-tickets] Stripe error for ${booking.id}:`, err.message);
    }
}

// ─── Email Helper ───────────────────────────────────────────────────

async function sendTicketIssuedEmail(
    booking: { id: string; pnr: string; session_id?: string | null; total_price?: number; currency?: string },
    eTickets: string[],
    supabase: ReturnType<typeof createClient>,
): Promise<void> {
    if (!RESEND_API_KEY) return;

    const [sessionRes, segmentsRes] = await Promise.all([
        booking.session_id
            ? supabase.from('booking_sessions').select('contact, passengers').eq('id', booking.session_id).single()
            : Promise.resolve({ data: null }),
        supabase.from('flight_segments').select('*').eq('booking_id', booking.id),
    ]);

    const email: string = (sessionRes.data as any)?.contact?.email ?? '';
    if (!email) return;

    const pax0 = (sessionRes.data as any)?.passengers?.[0];
    const passengerName = pax0 ? `${pax0.firstName} ${pax0.lastName}` : 'Traveler';
    const segments: any[] = (segmentsRes.data as any[]) ?? [];
    const firstSeg = segments[0];
    const lastSeg = segments[segments.length - 1];
    const route = firstSeg && lastSeg ? `${firstSeg.origin} → ${lastSeg.destination}` : 'N/A';
    const formattedPrice = new Intl.NumberFormat('en-US', { style: 'currency', currency: booking.currency || 'USD' }).format(booking.total_price ?? 0);

    const ticketHtml = eTickets.length > 0
        ? `<div style="background:#f0fdf4;padding:15px;border-radius:8px;margin:20px 0;border-left:4px solid #22c55e;"><p style="margin:0;color:#14532d;font-size:14px;"><strong>E-Ticket Numbers:</strong><br>${eTickets.map(t => `<span style="font-family:monospace;font-weight:700;">${t}</span>`).join('<br>')}</p></div>`
        : '';

    const segRows = segments.map((s: any) => {
        const dep = new Date(s.departure).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
        const arr = new Date(s.arrival).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
        return `<tr><td style="padding:10px;border-bottom:1px solid #e5e7eb;"><strong>${s.airline}</strong><br><span style="color:#6b7280;font-size:13px;">${s.flight_number}</span></td><td style="padding:10px;border-bottom:1px solid #e5e7eb;"><strong>${s.origin}</strong><br><span style="color:#6b7280;font-size:13px;">${dep}</span></td><td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:center;color:#9ca3af;">→</td><td style="padding:10px;border-bottom:1px solid #e5e7eb;"><strong>${s.destination}</strong><br><span style="color:#6b7280;font-size:13px;">${arr}</span></td></tr>`;
    }).join('');

    const receiptUrl = `${SITE_URL}/trips/invoice/${booking.id}?type=flight`;

    const html = `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;">
<div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:30px;border-radius:12px 12px 0 0;text-align:center;">
  <h1 style="color:white;margin:0;">E-Ticket Issued!</h1>
  <p style="color:rgba(255,255,255,0.9);margin:10px 0 0;">${route}</p>
</div>
<div style="background:#fff;padding:30px;border:1px solid #e5e7eb;border-top:none;">
  <p>Dear <strong>${passengerName}</strong>, your e-ticket has been issued. Your booking is fully confirmed.</p>
  <p><strong>PNR:</strong> <span style="font-family:monospace;font-size:18px;color:#4f46e5;">${booking.pnr}</span></p>
  <p><strong>Total Paid:</strong> ${formattedPrice}</p>
  ${ticketHtml}
  <table style="width:100%;border-collapse:collapse;">${segRows}</table>
  <div style="text-align:center;margin:24px 0 8px;">
    <a href="${receiptUrl}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 28px;border-radius:8px;">View / Download Receipt</a>
  </div>
</div>
</body></html>`;

    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: 'CheapestGo <no-reply@mail.cheapestgo.com>', to: [email], subject: `E-Ticket Issued ✅ – ${route} (PNR: ${booking.pnr})`, html }),
    });
    console.log(`[poll-pending-tickets] Ticket email → ${email}: ${res.status}`);
}
