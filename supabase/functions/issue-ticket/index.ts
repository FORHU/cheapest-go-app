/**
 * Issue Ticket — Supabase Edge Function
 *
 * POST /functions/v1/issue-ticket
 *
 * Issues an airline e-ticket for a confirmed booking.
 *   1. Retrieves the booking from flight_bookings
 *   2. Calls Mystifly or Amadeus ticketing endpoint
 *   3. Updates booking status to "ticketed"
 *   4. Saves e-ticket numbers to passengers
 *
 * POST body:
 *   { bookingId: string }
 *
 * Returns:
 *   { success: true, bookingId: string, pnr: string, ticketNumbers: string[] }
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

declare const Deno: any;

import { ticketFlight, MystiflyError } from '../_shared/mystiflyClient.ts';
import { amadeusRequest, AmadeusError } from '../_shared/amadeusClient.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Types ──────────────────────────────────────────────────────────

interface FlightBooking {
    id: string;
    user_id: string;
    pnr: string;
    provider: 'mystifly' | 'amadeus';
    total_price: number;
    status: string;
}

interface TicketResult {
    ticketNumbers: string[];
    providerStatus: string;
}

// ─── Handler ────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const startMs = Date.now();

    try {
        // ── Parse & Validate ──
        const { bookingId } = JSON.parse(await req.text());

        if (!bookingId) {
            return jsonResponse({ success: false, error: 'bookingId is required' }, 400);
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
            .select('id, user_id, pnr, provider, total_price, status')
            .eq('id', bookingId)
            .single();

        if (fetchError || !booking) {
            return jsonResponse({ success: false, error: 'Booking not found' }, 404);
        }

        const fb = booking as FlightBooking;

        // Validate status — must be "booked" to issue ticket
        if (fb.status === 'ticketed') {
            const existingTickets = await getExistingTicketNumbers(supabase, bookingId);
            return jsonResponse({
                success: true,
                bookingId: fb.id,
                pnr: fb.pnr,
                ticketNumbers: existingTickets,
                message: 'Ticket already issued',
            });
        }

        if (fb.status !== 'booked') {
            return jsonResponse(
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
        } else if (fb.provider === 'amadeus') {
            result = await ticketWithAmadeus(fb.pnr);
        } else {
            return jsonResponse(
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
                // Assign ticket numbers to passengers in order
                const updates = passengers.map((pax, idx) => ({
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

        return jsonResponse({
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
            err instanceof AmadeusError ? Math.max(err.status, 400) :
            500;

        return jsonResponse(
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

    // Mystifly returns ticket numbers in TktNumbers or ETicketNumbers
    const ticketNumbers: string[] = extractTicketNumbers(data);
    const providerStatus = String(data.Status ?? 'ticketed');

    return { ticketNumbers, providerStatus };
}

/**
 * Extract e-ticket numbers from Mystifly's ticketing response.
 * The API may return them in various fields depending on version.
 */
function extractTicketNumbers(data: Record<string, any>): string[] {
    // Check common Mystifly ticket number fields
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

    // Check nested TravelItinerary → TicketInfo
    const ticketInfos: any[] = data.TravelItinerary?.TicketInfo
        ?? data.TicketInfo
        ?? [];

    if (Array.isArray(ticketInfos) && ticketInfos.length > 0) {
        return ticketInfos
            .map((t: any) => t.TicketNumber ?? t.ETicketNumber ?? '')
            .filter(Boolean);
    }

    // Single ticket number
    if (data.TicketNumber) return [String(data.TicketNumber)];
    if (data.ETicketNumber) return [String(data.ETicketNumber)];

    return [];
}

// ─── Amadeus Ticketing ──────────────────────────────────────────────

/**
 * Amadeus Flight Orders are typically auto-ticketed on creation.
 * This retrieves the order to confirm ticketing status and extract
 * ticket numbers from the existing order.
 */
async function ticketWithAmadeus(pnr: string): Promise<TicketResult> {
    // Retrieve the Amadeus order using the PNR as the order identifier
    const raw: any = await amadeusRequest(`/v1/booking/flight-orders/${pnr}`);

    const order = raw.data;
    if (!order) {
        throw new Error('Amadeus order not found');
    }

    // Extract ticket numbers from travelers' documents
    const ticketNumbers: string[] = [];

    const travelers = order.travelers ?? [];
    for (const traveler of travelers) {
        const docs = traveler.documents ?? [];
        for (const doc of docs) {
            if (doc.documentType === 'ETICKET' && doc.number) {
                ticketNumbers.push(doc.number);
            }
        }
    }

    // Also check associatedRecords for ticket references
    if (ticketNumbers.length === 0) {
        const records = order.associatedRecords ?? [];
        for (const rec of records) {
            if (rec.reference && rec.originSystemCode === 'GDS') {
                ticketNumbers.push(rec.reference);
            }
        }
    }

    // Also check ticketingAgreement
    const ticketing = order.ticketingAgreement;
    const isTicketed = ticketing?.option === 'CONFIRM'
        || order.type === 'flight-order';

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

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
    return new Response(
        JSON.stringify(body),
        { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
}
