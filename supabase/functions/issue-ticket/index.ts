/**
 * Issue Ticket — Supabase Edge Function
 *
 * POST /functions/v1/issue-ticket
 *
 * Issues an airline e-ticket for a confirmed booking.
 *   1. Retrieves the booking from flight_bookings
 *   2. Calls Mystifly or Duffel ticketing endpoint
 *   3. Updates booking status to "ticketed"
 *   4. Saves e-ticket numbers to passengers
 *
 * POST body:
 *   { bookingId: string }
 *
 * Returns:
 *   { success: true, bookingId: string, pnr: string, ticketNumbers: string[] }
 */

import { getCorsHeaders } from '../_shared/cors.ts';
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

declare const Deno: any;

import { ticketFlight, MystiflyError } from '../_shared/mystiflyClient.ts';
import { getDuffelOrder } from '../_shared/duffelClient.ts';


// ─── Types ──────────────────────────────────────────────────────────

interface FlightBooking {
    id: string;
    user_id: string;
    pnr: string;
    provider: 'mystifly' | 'duffel';
    total_price: number;
    status: string;
    provider_order_id?: string;
}

interface TicketResult {
    ticketNumbers: string[];
    providerStatus: string;
}

// ─── Handler ────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
    const corsHeaders = getCorsHeaders(req);

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const startMs = Date.now();

    try {
        // ── Parse & Validate ──
        const { bookingId } = JSON.parse(await req.text());

        if (!bookingId) {
            return jsonResponse(corsHeaders, { success: false, error: 'bookingId is required' }, 400);
        }

        // ── Supabase Admin Client ──
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

        if (!supabaseUrl || !serviceRoleKey) {
            throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
        }

        const supabase = createClient(supabaseUrl, serviceRoleKey);

        // ── 1. Get Booking from Database ──
        const { data: booking, error: fetchError } = await supabase
            .from('flight_bookings')
            .select('id, user_id, pnr, provider, total_price, status, provider_order_id')
            .eq('id', bookingId)
            .single();

        if (fetchError || !booking) {
            return jsonResponse(corsHeaders, { success: false, error: 'Booking not found' }, 404);
        }

        const fb = booking as FlightBooking;

        // Validate status — must be "booked" or "awaiting_ticket" to issue ticket
        if (fb.status === 'ticketed') {
            const existingTickets = await getExistingTicketNumbers(supabase, bookingId);
            return jsonResponse(corsHeaders, {
                success: true,
                bookingId: fb.id,
                pnr: fb.pnr,
                ticketNumbers: existingTickets,
                message: 'Ticket already issued',
            });
        }

        if (fb.status !== 'booked' && fb.status !== 'awaiting_ticket') {
            return jsonResponse(corsHeaders,
                { success: false, error: `Cannot issue ticket for booking with status: ${fb.status}` },
                409,
            );
        }

        console.log('[issue-ticket] Processing:', {
            bookingId: fb.id,
            pnr: fb.pnr,
            provider: fb.provider,
        });

        // ── 2. Call Provider Ticketing Endpoint ──
        let result: TicketResult;

        if (fb.provider === 'mystifly') {
            result = await ticketWithMystifly(fb.pnr);
        } else if (fb.provider === 'duffel') {
            // Duffel orders are retrieved by their order ID, which we saved in provider_order_id column
            result = await ticketWithDuffel(fb.provider_order_id ?? fb.pnr);
        } else {
            return jsonResponse(corsHeaders,
                { success: false, error: `Unknown provider: ${fb.provider}` },
                400,
            );
        }

        console.log('[issue-ticket] Ticket result:', {
            ticketCount: result.ticketNumbers.length,
            providerStatus: result.providerStatus,
        });

        // ── 3. Update Booking Status to "ticketed" ──
        const { error: updateError } = await supabase
            .from('flight_bookings')
            .update({ status: 'ticketed' })
            .eq('id', bookingId);

        if (updateError) {
            console.error('[issue-ticket] Failed to update booking status:', updateError);
            throw new Error(`Failed to update booking: ${updateError.message}`);
        }

        // ── 4. Save E-Ticket Numbers to Passengers ──
        if (result.ticketNumbers.length > 0) {
            const { data: passengers } = await supabase
                .from('passengers')
                .select('id')
                .eq('booking_id', bookingId)
                .order('created_at', { ascending: true });

            if (passengers?.length) {
                const updates = passengers.map((pax: any, idx: number) => ({
                    id: pax.id,
                    ticket_number: result.ticketNumbers[idx] ?? result.ticketNumbers[0],
                }));

                for (const update of updates) {
                    await supabase
                        .from('passengers')
                        .update({ ticket_number: update.ticket_number })
                        .eq('id', update.id);
                }
            }
        }

        const durationMs = Date.now() - startMs;
        console.log(`[issue-ticket] Completed: ${fb.pnr} → ${result.ticketNumbers.length} ticket(s) in ${durationMs}ms`);

        return jsonResponse(corsHeaders, {
            success: true,
            bookingId: fb.id,
            pnr: fb.pnr,
            ticketNumbers: result.ticketNumbers,
        });
    } catch (err: any) {
        const durationMs = Date.now() - startMs;
        console.error(`[issue-ticket] Error (${durationMs}ms):`, err.message);

        const status =
            err instanceof MystiflyError ? Math.max(err.status, 400) :
                500;

        return jsonResponse(getCorsHeaders(req),
            { success: false, error: err.message || 'Ticketing failed' },
            status,
        );
    }
});

// ─── Mystifly Ticketing ─────────────────────────────────────────────

async function ticketWithMystifly(pnr: string): Promise<TicketResult> {
    const raw = await ticketFlight(pnr);

    if (!raw.Success) {
        throw new Error(raw.Message ?? 'Mystifly ticketing failed');
    }

    const data = raw.Data ?? {};

    const ticketNumbers: string[] = extractTicketNumbers(data);
    const providerStatus = String(data.Status ?? 'ticketed');

    return { ticketNumbers, providerStatus };
}

function extractTicketNumbers(data: Record<string, any>): string[] {
    const candidates = [
        data.TktNumbers,
        data.ETicketNumbers,
        data.TicketNumbers,
        data.eTicketNumbers,
    ];

    for (const field of candidates) {
        if (Array.isArray(field) && field.length > 0) {
            return field.map(String);
        }
    }

    const ticketInfos: any[] = data.TravelItinerary?.TicketInfo
        ?? data.TicketInfo
        ?? [];

    if (Array.isArray(ticketInfos) && ticketInfos.length > 0) {
        return ticketInfos
            .map((t: any) => t.TicketNumber ?? t.ETicketNumber ?? '')
            .filter(Boolean);
    }

    if (data.TicketNumber) return [String(data.TicketNumber)];
    if (data.ETicketNumber) return [String(data.ETicketNumber)];

    return [];
}

// ─── Duffel Ticketing ───────────────────────────────────────────────

async function ticketWithDuffel(orderId: string): Promise<TicketResult> {
    const raw = await getDuffelOrder(orderId);

    const order = raw.data;
    if (!order) {
        throw new Error('Duffel order not found');
    }

    const ticketNumbers: string[] = [];

    const documents = order.documents ?? [];
    for (const doc of documents) {
        if (doc.type === 'electronic_ticket' && doc.unique_identifier) {
            // Document might be tied to multiple passengers or single, but usually 1:1 for tickets
            ticketNumbers.push(doc.unique_identifier);
        }
    }

    // If tickets aren't issued yet, Duffel status might still show payment/ticketing pending.
    // However, instant orders are usually ticketed immediately.
    const isTicketed = ticketNumbers.length > 0;

    return {
        ticketNumbers,
        providerStatus: isTicketed ? 'ticketed' : 'confirmed',
    };
}

// ─── Helpers ────────────────────────────────────────────────────────

async function getExistingTicketNumbers(
    supabase: any,
    bookingId: string,
): Promise<string[]> {
    const { data: passengers } = await supabase
        .from('passengers')
        .select('ticket_number')
        .eq('booking_id', bookingId)
        .not('ticket_number', 'is', null);

    return (passengers ?? []).map((p: any) => p.ticket_number).filter(Boolean);
}

function jsonResponse(corsHeaders: Record<string, string>, body: Record<string, unknown>, status = 200): Response {
    return new Response(
        JSON.stringify(body),
        { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
}
