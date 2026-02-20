/**
 * Revalidate Flight — Supabase Edge Function
 *
 * POST /functions/v1/revalidate-flight
 *
 * Checks if a flight offer is still available and returns the current
 * price before booking. Routes to Mystifly or Amadeus based on provider.
 *
 * Must be called before booking to detect price changes and expired fares.
 * API keys never leave the server — only normalized results are returned.
 *
 * POST body:
 *   {
 *     provider: "mystifly" | "amadeus",
 *     flightPayload: {
 *       traceId?: string,      // Mystifly FareSourceCode
 *       resultIndex?: string,   // Amadeus offer ID
 *       oldPrice: number,       // Original price for change detection
 *       currency?: string,
 *       flight?: object,        // Full Amadeus flight-offer for repricing
 *     },
 *     userId: string
 *   }
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

declare const Deno: any;

import type { FlightProvider } from '../_shared/types.ts';
import { revalidateFare, MystiflyError } from '../_shared/mystiflyClient.ts';
import { amadeusRequest, AmadeusError } from '../_shared/amadeusClient.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Request / Response Types ───────────────────────────────────────

interface RevalidateBody {
    provider: FlightProvider;
    flightPayload: {
        traceId?: string;
        resultIndex?: string;
        oldPrice: number;
        currency?: string;
        flight?: Record<string, any>;
    };
    userId: string;
}

interface RevalidateResult {
    success: boolean;
    priceChanged: boolean;
    oldPrice: number;
    newPrice: number;
    seatsAvailable: boolean;
    provider: FlightProvider;
    validatedFlight: {
        price: number;
        baseFare: number;
        taxes: number;
        currency: string;
        pricePerAdult: number;
        traceId?: string;
    };
    error?: string;
    durationMs: number;
}

// ─── Handler ────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const startMs = Date.now();

    try {
        // ── Parse & Validate ──
        const body: RevalidateBody = JSON.parse(await req.text());

        if (!body.provider || !body.flightPayload || !body.userId) {
            return jsonResponse({
                success: false,
                error: 'Required: provider, flightPayload, userId',
            }, 400);
        }

        if (body.provider !== 'mystifly' && body.provider !== 'amadeus') {
            return jsonResponse({
                success: false,
                error: `Unknown provider: ${body.provider}`,
            }, 400);
        }

        const oldPrice = body.flightPayload.oldPrice ?? 0;

        console.log(`[revalidate-flight] Provider: ${body.provider}, userId: ${body.userId}, oldPrice: ${oldPrice}`);

        // ── Route to provider ──
        let result: RevalidateResult;

        if (body.provider === 'mystifly') {
            result = await revalidateMystifly(body, oldPrice, startMs);
        } else {
            result = await revalidateAmadeus(body, oldPrice, startMs);
        }

        console.log(`[revalidate-flight] Done: available=${result.seatsAvailable}, priceChanged=${result.priceChanged}, new=${result.newPrice} in ${result.durationMs}ms`);

        return jsonResponse(result, result.success ? 200 : 422);
    } catch (err: any) {
        console.error('[revalidate-flight] Error:', err.message);

        return jsonResponse({
            success: false,
            priceChanged: false,
            oldPrice: 0,
            newPrice: 0,
            seatsAvailable: false,
            provider: 'mystifly',
            validatedFlight: { price: 0, baseFare: 0, taxes: 0, currency: 'USD', pricePerAdult: 0 },
            error: err.message || 'Revalidation failed',
            durationMs: Date.now() - startMs,
        }, 500);
    }
});

// ─── Mystifly Revalidation ──────────────────────────────────────────

async function revalidateMystifly(
    body: RevalidateBody,
    oldPrice: number,
    startMs: number,
): Promise<RevalidateResult> {
    const traceId = body.flightPayload.traceId;

    if (!traceId) {
        return {
            success: false,
            priceChanged: false,
            oldPrice,
            newPrice: 0,
            seatsAvailable: false,
            provider: 'mystifly',
            validatedFlight: { price: 0, baseFare: 0, taxes: 0, currency: 'USD', pricePerAdult: 0 },
            error: 'traceId (fareSourceCode) is required for Mystifly revalidation',
            durationMs: Date.now() - startMs,
        };
    }

    const raw = await revalidateFare(traceId);

    // ── Handle failure / unavailable ──
    if (!raw.Success) {
        const msg: string = raw.Message ?? '';
        const isUnavailable = /not available|not found|expired/i.test(msg);

        return {
            success: true,
            priceChanged: false,
            oldPrice,
            newPrice: 0,
            seatsAvailable: false,
            provider: 'mystifly',
            validatedFlight: { price: 0, baseFare: 0, taxes: 0, currency: 'USD', pricePerAdult: 0 },
            error: isUnavailable ? 'Flight no longer available' : msg,
            durationMs: Date.now() - startMs,
        };
    }

    // ── Parse updated pricing ──
    const revalData = raw.Data ?? {};
    const priceChanged = revalData.PriceChanged === true;

    const itinerary = revalData.FareItinerary ?? revalData;
    const fareInfo = itinerary.AirItineraryFareInfo ?? revalData;
    const itinFare = fareInfo.ItinTotalFare;

    const currency: string = itinFare?.TotalFare?.CurrencyCode ?? body.flightPayload.currency ?? 'USD';
    const newPrice = Number(itinFare?.TotalFare?.Amount) || 0;
    const baseFare = Number(itinFare?.BaseFare?.Amount) || 0;
    const taxes = Number(itinFare?.TotalTax?.Amount) || 0;

    // Per-adult price
    let pricePerAdult = newPrice;
    const fareBreakdown: any[] = fareInfo.FareBreakdown ?? [];
    for (const fb of fareBreakdown) {
        if (fb?.PassengerTypeQuantity?.Code === 'ADT') {
            pricePerAdult = Number(fb?.PassengerFare?.TotalFare?.Amount) || newPrice;
            break;
        }
    }

    // Updated traceId if FareSourceCode changed
    const newTraceId: string | undefined =
        fareInfo.FareSourceCode ?? revalData.FareSourceCode ?? traceId;

    return {
        success: true,
        priceChanged: priceChanged || Math.abs(newPrice - oldPrice) > 0.01,
        oldPrice,
        newPrice,
        seatsAvailable: true,
        provider: 'mystifly',
        validatedFlight: {
            price: newPrice,
            baseFare,
            taxes,
            currency,
            pricePerAdult,
            traceId: newTraceId,
        },
        durationMs: Date.now() - startMs,
    };
}

// ─── Amadeus Revalidation ───────────────────────────────────────────

/**
 * Amadeus uses POST /v1/shopping/flight-offers/pricing to confirm
 * an offer's price and availability.
 *
 * Requires the full flight-offer object from the original search.
 */
async function revalidateAmadeus(
    body: RevalidateBody,
    oldPrice: number,
    startMs: number,
): Promise<RevalidateResult> {
    const flightOffer = body.flightPayload.flight;

    if (!flightOffer) {
        return {
            success: false,
            priceChanged: false,
            oldPrice,
            newPrice: 0,
            seatsAvailable: false,
            provider: 'amadeus',
            validatedFlight: { price: 0, baseFare: 0, taxes: 0, currency: 'USD', pricePerAdult: 0 },
            error: 'flightPayload.flight (full Amadeus offer) is required for Amadeus revalidation',
            durationMs: Date.now() - startMs,
        };
    }

    // POST /v1/shopping/flight-offers/pricing
    const raw: any = await amadeusRequest('/v1/shopping/flight-offers/pricing', {
        method: 'POST',
        body: {
            data: {
                type: 'flight-offers-pricing',
                flightOffers: [flightOffer],
            },
        },
    });

    const pricedOffers: any[] = raw.data?.flightOffers ?? [];

    if (!pricedOffers.length) {
        return {
            success: true,
            priceChanged: false,
            oldPrice,
            newPrice: 0,
            seatsAvailable: false,
            provider: 'amadeus',
            validatedFlight: { price: 0, baseFare: 0, taxes: 0, currency: 'USD', pricePerAdult: 0 },
            error: 'Flight offer no longer available',
            durationMs: Date.now() - startMs,
        };
    }

    const offer = pricedOffers[0];
    const newPrice = parseFloat(offer.price?.grandTotal ?? offer.price?.total ?? '0');
    const baseFare = parseFloat(offer.price?.base ?? '0');
    const currency: string = offer.price?.currency ?? body.flightPayload.currency ?? 'USD';
    const taxes = Math.max(0, newPrice - baseFare);

    // Per-adult price
    const adultPricing = offer.travelerPricings?.find((tp: any) => tp.travelerType === 'ADULT');
    const pricePerAdult = adultPricing
        ? parseFloat(adultPricing.price?.total ?? '0')
        : newPrice;

    const seatsAvailable = (offer.numberOfBookableSeats ?? 0) > 0
        || pricedOffers.length > 0; // if pricing succeeds, seats exist

    return {
        success: true,
        priceChanged: Math.abs(newPrice - oldPrice) > 0.01,
        oldPrice,
        newPrice,
        seatsAvailable,
        provider: 'amadeus',
        validatedFlight: {
            price: newPrice,
            baseFare,
            taxes,
            currency,
            pricePerAdult,
        },
        durationMs: Date.now() - startMs,
    };
}

// ─── Helpers ────────────────────────────────────────────────────────

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
    return new Response(
        JSON.stringify(body),
        { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
}
