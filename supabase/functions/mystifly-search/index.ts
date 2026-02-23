/**
 * Mystifly Flight Search — Supabase Edge Function
 *
 * POST /functions/v1/mystifly-search
 *
 * Searches Mystifly lowest-fare via Search/Flight v1 and returns
 * normalized NormalizedFlight[] results. Automatically creates a
 * session if one doesn't exist.
 *
 * POST body:
 *   { origin, destination, departureDate, returnDate?, adults,
 *     children?, infants?, cabinClass?, tripType?, maxOffers?, nonStopOnly? }
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

declare const Deno: any;

import type { NormalizedFlight, CabinClass, TripType } from '../_shared/types.ts';
import { searchFlights, MystiflyError, CABIN_MAP, TRIP_TYPE_MAP, MYSTIFLY_TARGET } from '../_shared/mystiflyClient.ts';
import { normalizeMystiflyResponse } from '../_shared/normalizeFlight.ts';


const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').filter(Boolean);

function getCorsHeaders(req: Request) {
    const origin = req.headers.get('Origin') ?? '';
    const allowedOrigin = ALLOWED_ORIGINS.length > 0
        ? (ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0])
        : '*';
    return {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    };
}

// ─── Request Body ───────────────────────────────────────────────────

interface MystiflySearchBody {
    origin: string;
    destination: string;
    departureDate: string;        // YYYY-MM-DD
    returnDate?: string;          // YYYY-MM-DD
    adults: number;
    children?: number;
    infants?: number;
    cabinClass?: CabinClass;
    tripType?: TripType;
    maxOffers?: number;
    nonStopOnly?: boolean;
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
        const body: MystiflySearchBody = JSON.parse(await req.text());

        if (!body.origin || !body.destination || !body.departureDate || !body.adults) {
            return jsonResponse(corsHeaders,
                { success: false, error: 'Required: origin, destination, departureDate, adults' },
                400,
            );
        }

        if (!/^[A-Z]{3}$/.test(body.origin) || !/^[A-Z]{3}$/.test(body.destination)) {
            return jsonResponse(corsHeaders,
                { success: false, error: 'origin and destination must be 3-letter IATA codes' },
                400,
            );
        }

        console.log('[mystifly-search] Request:', {
            origin: body.origin,
            destination: body.destination,
            departureDate: body.departureDate,
            returnDate: body.returnDate,
            adults: body.adults,
            cabinClass: body.cabinClass,
        });

        // ── Infer trip type ──
        const tripType: TripType = body.tripType
            ?? (body.returnDate ? 'round-trip' : 'one-way');

        // ── Build Mystifly request body ──
        const originDestinations: {
            DepartureDateTime: string;
            OriginLocationCode: string;
            DestinationLocationCode: string;
        }[] = [
                {
                    DepartureDateTime: `${body.departureDate}T00:00:00.000Z`,
                    OriginLocationCode: body.origin,
                    DestinationLocationCode: body.destination,
                },
            ];

        if (body.returnDate) {
            originDestinations.push({
                DepartureDateTime: `${body.returnDate}T00:00:00.000Z`,
                OriginLocationCode: body.destination,
                DestinationLocationCode: body.origin,
            });
        }

        const passengerTypes: { Code: string; Quantity: number }[] = [];
        if (body.adults > 0) {
            passengerTypes.push({ Code: 'ADT', Quantity: body.adults });
        }
        if (body.children && body.children > 0) {
            passengerTypes.push({ Code: 'CHD', Quantity: body.children });
        }
        if (body.infants && body.infants > 0) {
            passengerTypes.push({ Code: 'INF', Quantity: body.infants });
        }

        const cabinCode = CABIN_MAP[body.cabinClass ?? 'economy'] ?? 'Y';
        const airTripType = TRIP_TYPE_MAP[tripType] ?? 'OneWay';

        const conversationId = crypto.randomUUID();

        const mystiflyBody = {
            OriginDestinationInformations: originDestinations,
            PassengerTypeQuantities: passengerTypes,
            IsRefundable: false,
            PricingSourceType: 'All',

            RequestOptions: getRequestOptions(body.maxOffers),
            ConversationId: conversationId,
            TravelPreferences: {


                AirTripType: airTripType,
                CabinPreference: cabinCode,
                MaxStopsQuantity: body.nonStopOnly ? 'Direct' : 'All',
                Preferences: {
                    CabinClassPreference: {
                        CabinType: cabinCode,
                        PreferenceLevel: 'Preferred',
                    },
                },
            },

        };



        // ── Call Mystifly Search (auto-creates session) ──
        const raw = await searchFlights(mystiflyBody, undefined, conversationId);

        const itinData = raw.Data?.PricedItineraries ?? raw.Data?.FareItineraries ?? [];
        console.log('[mystifly-search] Itineraries count:', itinData.length);
        if (!raw.Success) console.log('[mystifly-search] Raw Message:', raw.Message);



        // ── Handle "flights not found" gracefully ──
        if (!raw.Success) {
            const msg: string = raw.Message ?? '';
            throw new MystiflyError(
                `Mystifly search failed: ${msg}`,
                'CLIENT',
                400,
            );
        }

        // ── Normalize ──
        const flights = normalizeMystiflyResponse(itinData);

        if (flights.length === 0) {
            console.log('[mystifly-search] Mystifly returned 0 itineraries');
        }

        // Inject our tunneled traceId (FareSourceCode|ConversationId)

        flights.forEach(offer => {
            if (offer.traceId) {
                offer.traceId = `${offer.traceId}|${conversationId}`;
            }
        });

        console.log(`[mystifly-search] Mystifly returned ${flights.length} raw itineraries`);

        // Sort by price ascending
        flights.sort((a, b) => a.price - b.price);

        const durationMs = Date.now() - startMs;


        console.log(`[mystifly-search] Normalized ${flights.length} flights in ${durationMs}ms`);

        // ── Response — clean, frontend-friendly JSON ──
        return jsonResponse(corsHeaders, {
            provider: 'mystifly',
            flights,
            totalResults: flights.length,
            durationMs,
        });


    } catch (err: any) {
        const durationMs = Date.now() - startMs;

        console.error('[mystifly-search] Error:', err.message);

        const status = err instanceof MystiflyError ? Math.max(err.status, 400) : 500;

        return jsonResponse(corsHeaders,
            {
                provider: 'mystifly',
                flights: [],
                totalResults: 0,
                durationMs,
                error: err.message || 'Mystifly search failed',
            },
            status,
        );
    }
});

// ─── Helpers ────────────────────────────────────────────────────────

function jsonResponse(headers: Record<string, string>, body: Record<string, unknown>, status = 200): Response {
    return new Response(
        JSON.stringify(body),
        { status, headers: { ...headers, 'Content-Type': 'application/json' } },
    );
}

function getRequestOptions(maxOffers?: number): string {
    if (!maxOffers || maxOffers <= 50) return 'Fifty';
    if (maxOffers <= 100) return 'Hundered';
    return 'TwoHundered';
}

