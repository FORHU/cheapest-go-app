/**
 * Duffel Flight Search — Supabase Edge Function
 *
 * POST /functions/v1/duffel-search
 */

import { getCorsHeaders } from '../_shared/cors.ts';
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createDuffelOfferRequest } from '../_shared/duffelClient.ts';
import { normalizeDuffelResponse } from '../_shared/normalizeFlight.ts';

declare const Deno: any;


// ─── Request Body ───────────────────────────────────────────────────

interface SearchBody {
    segments: { origin: string; destination: string; departureDate: string }[];
    tripType: string;
    adults: number;
    children?: number;
    infants?: number;
    cabinClass?: string;
    nonStopOnly?: boolean;
}

// ─── Duffel Mapper ──────────────────────────────────────────────────

function toDuffelCabin(cabin: string): string {
    const map: Record<string, string> = {
        economy: 'economy',
        premium_economy: 'premium_economy',
        business: 'business',
        first: 'first',
    };
    return map[cabin] ?? 'economy';
}

// ─── Handler ────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
    const corsHeaders = getCorsHeaders(req);

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const body: SearchBody = JSON.parse(await req.text());

        if (!Array.isArray(body.segments) || body.segments.length === 0 || !body.adults) {
            return new Response(JSON.stringify({ error: 'Missing required search params' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        console.log('[duffel-search] Starting search:', JSON.stringify(body));

        let cabinClass = body.cabinClass ? toDuffelCabin(body.cabinClass) : 'economy';

        const passengers: any[] = [];
        for (let i = 0; i < body.adults; i++) passengers.push({ type: 'adult' });
        for (let i = 0; i < (body.children || 0); i++) passengers.push({ type: 'child' });
        for (let i = 0; i < (body.infants || 0); i++) passengers.push({ type: 'infant_without_seat' });

        const slices = body.segments.map(s => ({
            origin: s.origin,
            destination: s.destination,
            departure_date: s.departureDate,
        }));

        const payload = {
            slices,
            passengers,
            cabin_class: cabinClass,
            // nonStopOnly is typically mapped via filters or parsing responses,
            // Duffel doesn't have a direct "non-stop only" flag in create offer request,
            // but we can filter max_connections in the request payload:
            ...(body.nonStopOnly && { max_connections: 0 }),
            return_offers: true,
        };

        const response = await createDuffelOfferRequest(payload);

        if (!response.data || !response.data.offers) {
            console.log('[duffel-search] No offers found.');
            return new Response(JSON.stringify({ success: true, flights: [] }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const offers = response.data.offers;
        let flights = normalizeDuffelResponse(offers);

        console.log(`[duffel-search] Returned ${flights.length} mapped flights`);

        return new Response(JSON.stringify({ success: true, flights }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (err: any) {
        console.error('[duffel-search] Handler error:', err.message);
        return new Response(JSON.stringify({ error: err.message, flights: [] }), {
            status: err.status || 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
