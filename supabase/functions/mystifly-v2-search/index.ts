/**
 * Mystifly V2 Flight Search — Supabase Edge Function
 *
 * POST /functions/v1/mystifly-v2-search
 *
 * Searches Mystifly Branded Fares via Search/Flight v2 and returns
 * normalized NormalizedFlight[] results. Automatically creates a
 * session if one doesn't exist.
 *
 * POST body:
 *   { origin, destination, departureDate, returnDate?, adults,
 *     children?, infants?, cabinClass?, tripType?, maxOffers?, nonStopOnly?, currency? }
 */

import { getCorsHeaders } from '../_shared/cors.ts';

declare const Deno: any;

import type { CabinClass, TripType } from '../_shared/types.ts';
import { searchBrandedFlights, createSession, MystiflyError, CABIN_MAP, TRIP_TYPE_MAP, getMystiflyTarget } from '../_shared/mystiflyClient.ts';
import { normalizeMystiflyV2Response } from '../_shared/normalizeFlight.ts';


const NATIONALITY = Deno.env.get('MYSTIFLY_NATIONALITY') ?? 'US';
const PRICING_SOURCE_TYPE = Deno.env.get('MYSTIFLY_PRICING_SOURCE_TYPE') ?? 'All';


// ─── Request Body ───────────────────────────────────────────────────

interface MystiflySearchBody {
    segments: { origin: string; destination: string; departureDate: string }[];
    adults: number;
    children?: number;
    infants?: number;
    cabinClass?: CabinClass;
    tripType?: TripType;
    maxOffers?: number;
    nonStopOnly?: boolean;
    currency?: string;
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

        if (!Array.isArray(body.segments) || body.segments.length === 0 || !body.adults) {
            return jsonResponse(corsHeaders,
                { success: false, error: 'Required: segments array and adults count' },
                400,
            );
        }

        console.log('[mystifly-v2-search] Request:', {
            segmentCount: body.segments.length,
            adults: body.adults,
            cabinClass: body.cabinClass,
            tripType: body.tripType,
        });

        // ── Infer trip type ──
        // NOTE: a 2-segment multi-city search MUST use the explicit tripType from the body
        // to avoid incorrectly inferring 'round-trip'.
        const tripType: TripType = body.tripType
            ?? (body.segments.length === 2 ? 'round-trip' : body.segments.length > 2 ? 'multi-city' : 'one-way');

        // ── Mystifly does not support multi-city itineraries ──
        // Return empty results gracefully instead of a 400 Validation Error.
        if (tripType === 'multi-city') {
            console.log('[mystifly-v2-search] Multi-city not supported by Mystifly v2, skipping.');
            return jsonResponse(corsHeaders, {
                success: true,
                flights: [],
                searchId: crypto.randomUUID(),
                durationMs: 0,
                provider: 'mystifly_v2',
                info: 'Mystifly does not support multi-city itineraries.',
            });
        }

        // ── Build Mystifly request body ──
        const originDestinations = body.segments.map(s => ({
            DepartureDateTime: `${s.departureDate}T00:00:00`,
            OriginLocationCode: s.origin.toUpperCase(),
            DestinationLocationCode: s.destination.toUpperCase(),
        }));

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

        // ── Obtain Session explicitly to tunnel it for flow consistency ──
        const sessionId = await createSession();
        const conversationId = crypto.randomUUID();

        const mystiflyBody = {
            OriginDestinationInformations: originDestinations,
            PassengerTypeQuantities: passengerTypes,
            PricingSourceType: PRICING_SOURCE_TYPE,
            Nationalities: [NATIONALITY],
            Nationality: NATIONALITY,
            NearByAirports: true,
            Target: getMystiflyTarget(),
            ConversationId: '',
            CurrencyCode: body.currency,
            TravelPreferences: {
                AirTripType: airTripType,
                CabinPreference: cabinCode,
                MaxStopsQuantity: body.nonStopOnly ? 'Direct' : 'All',
                PreferenceLevel: 'Preferred',
                Preferences: {
                    CabinClassPreference: {
                        CabinType: cabinCode,
                        PreferenceLevel: 'Preferred',
                    },
                },
                VendorPreferenceCodes: null,
                VendorExcludeCodes: null,
            },
            RequestOptions: getRequestOptions(body.maxOffers),
        };

        console.log('[mystifly-v2-search] Final Mystifly Body keys:', Object.keys(mystiflyBody));
        console.log('[mystifly-v2-search] First OriginDest:', JSON.stringify(mystiflyBody.OriginDestinationInformations[0]));

        // ── Call Mystifly V2 Search ──
        const raw = await searchBrandedFlights(mystiflyBody, sessionId, conversationId);

        const itinData = raw.Data?.PricedItineraries ?? raw.Data?.FareItineraries ?? [];
        console.log('[mystifly-v2-search] Itineraries count:', itinData.length);
        if (itinData.length > 0) {
            console.log('[mystifly-v2-search] Itineraries found in raw response.');
        }
        if (!raw.Success) console.log('[mystifly-v2-search] Raw Message:', raw.Message);



        // ── Handle "flights not found" gracefully ──
        if (!raw.Success) {
            const msg: string = raw.Message ?? '';
            const isEmptyResult = msg.toLowerCase().includes('not found')
                || msg.toLowerCase().includes('no flights')
                || msg.toLowerCase().includes('no result');

            if (isEmptyResult) {
                console.log('[mystifly-v2-search] No flights found for this route — returning empty result');
                return jsonResponse(corsHeaders, {
                    provider: 'mystifly-v2',
                    flights: [],
                    totalResults: 0,
                    durationMs: Date.now() - startMs,
                });
            }

            throw new MystiflyError(
                `Mystifly V2 search failed: ${msg}`,
                'CLIENT',
                400,
            );
        }

        // ── Normalize ──
        // Data context is required for V2 to map Segments, Brands and Prices
        const flights = normalizeMystiflyV2Response(itinData, raw.Data);

        if (flights.length === 0) {
            console.log('[mystifly-v2-search] Mystifly V2 returned 0 itineraries');
        }

        // Log all top-level response keys to locate SearchIdentifier
        console.log('[mystifly-v2-search] Top-level response keys:', Object.keys(raw).join(', '));

        const searchIdentifier = raw.SearchIdentifier ?? raw.Data?.SearchIdentifier ?? raw.Data?.TraceId ?? '';
        console.log('[mystifly-v2-search] SearchIdentifier:', searchIdentifier ? searchIdentifier.slice(0, 36) + '...' : '(empty — V2 fares need this for booking)');

        // Inject our tunneled traceId (FareSourceCode|ConversationId|SessionId|SearchIdentifier)
        flights.forEach(offer => {
            if (offer.traceId) {
                offer.traceId = `${offer.traceId}|${conversationId}|${sessionId}|${searchIdentifier}`;
            }
        });

        console.log(`[mystifly-v2-search] Mystifly V2 returned ${flights.length} raw itineraries`);

        // Sort by normalized price ascending
        flights.sort((a, b) => a.normalizedPriceUsd - b.normalizedPriceUsd);
        // ── Currency Fallback Conversion ──
        const targetCurrency = body.currency || 'USD';
        const convertedFlights = flights.map(f => {
            if (f.currency === targetCurrency) return f;

            const rates: Record<string, number> = { 'USD': 1, 'PHP': 58.0, 'KRW': 1350.0 };
            const fromRate = rates[f.currency.toUpperCase()] || 1;
            const toRate = rates[targetCurrency.toUpperCase()] || 1;

            if (fromRate && toRate && f.currency !== targetCurrency) {
                const ratio = toRate / fromRate;
                return {
                    ...f,
                    price: f.price * ratio,
                    baseFare: f.baseFare * ratio,
                    taxes: (f.taxes || 0) * ratio,
                    pricePerAdult: f.pricePerAdult * ratio,
                    currency: targetCurrency
                };
            }
            return f;
        });

        const durationMs = Date.now() - startMs;

        console.log(`[mystifly-v2-search] Normalized ${convertedFlights.length} V2 flights (converted to ${targetCurrency}) in ${durationMs}ms`);

        // ── Response — clean, frontend-friendly JSON ──
        return jsonResponse(corsHeaders, {
            provider: 'mystifly_v2', // Differentiating from v1
            flights: convertedFlights,
            totalResults: convertedFlights.length,
            durationMs,
        });


    } catch (err: any) {
        const durationMs = Date.now() - startMs;

        console.error('[mystifly-v2-search] Error:', err.message);

        const status = err instanceof MystiflyError ? Math.max(err.status, 400) : 500;

        return jsonResponse(corsHeaders,
            {
                provider: 'mystifly-v2',
                flights: [],
                totalResults: 0,
                durationMs,
                error: err.message || 'Mystifly V2 search failed',
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
    if (maxOffers <= 100) return 'Hundred';
    return 'TwoHundred';
}
