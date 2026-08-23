import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/utils/env';
import { parseDuffelOffer } from '@/lib/server/flights/providers/duffel';
import { normalizedToFlightOffer } from '@/utils/flight-utils';

export const dynamic = 'force-dynamic';

/**
 * POST /api/flights/offer-refresh
 *
 * Re-searches Duffel using the itinerary from an expired offer and returns a
 * fresh offer with a new ID. Used when bags/seat-map return 404 because the
 * original offer's NDC lock expired before the user reached those steps.
 *
 * Body: { rawOffer: <Duffel raw offer object> }
 * Returns: { success, newOfferId, newOffer: <FlightOffer> }
 *
 * Refreshing is best-effort: the caller falls back to "this offer expired,
 * search again" whenever `success` is false. So an upstream Duffel failure
 * comes back as 200 + { success: false, reason }, not as an error status.
 * Forwarding Duffel's status verbatim used to surface its account-level 429 as
 * a 429 from our own origin, which says something quite different — that *this
 * client* is being rate limited by us — and had Cloudflare and the browser
 * treating a normal upstream hiccup as client abuse. Non-2xx is now reserved
 * for faults in the request itself (400) and for us being misconfigured (503).
 */
export async function POST(req: NextRequest) {
    const { rawOffer } = await req.json();

    if (!rawOffer?.slices?.length) {
        return NextResponse.json({ success: false, error: 'rawOffer with slices is required' }, { status: 400 });
    }

    const token = env.DUFFEL_TOKEN;
    if (!token) {
        return NextResponse.json({ success: false, error: 'Duffel not configured' }, { status: 503 });
    }

    // Extract itinerary from the expired offer
    const slices = rawOffer.slices.map((slice: any) => {
        const firstSeg = slice.segments[0];
        return {
            origin: firstSeg.origin.iata_code,
            destination: slice.segments[slice.segments.length - 1].destination.iata_code,
            departure_date: firstSeg.departing_at.slice(0, 10),
        };
    });

    const passengers = (rawOffer.passengers ?? []).map((p: any) => ({
        type: p.type ?? 'adult',
    }));
    if (passengers.length === 0) passengers.push({ type: 'adult' });

    // Detect cabin class from first segment's passengers array
    const cabinClass: string =
        rawOffer.slices[0]?.segments[0]?.passengers?.[0]?.cabin_class ?? 'economy';

    // Target airline+flight for best match (marketing carrier of first segment)
    const targetAirlineCode: string | null =
        rawOffer.slices[0]?.segments[0]?.marketing_carrier?.iata_code ?? null;
    const targetFlightNumber: string | null = targetAirlineCode
        ? `${targetAirlineCode}${rawOffer.slices[0]?.segments[0]?.marketing_carrier_flight_number ?? ''}`
        : null;

    // Create new offer request. Duffel rate limits per account, so a burst of
    // users hitting an expired offer at once earns a 429 that clears in a second
    // or two — worth one honoured retry before giving up on the refresh.
    const MAX_ATTEMPTS = 2;
    let offerRequestRes: Response | null = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        offerRequestRes = await fetch('https://api.duffel.com/air/offer_requests', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Duffel-Version': 'v2',
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({
                data: { slices, passengers, cabin_class: cabinClass, return_offers: true },
            }),
            signal: AbortSignal.timeout(12000),
        });

        const retryable = offerRequestRes.status === 429 || offerRequestRes.status >= 500;
        if (!retryable || attempt === MAX_ATTEMPTS) break;

        // Retry-After is seconds when Duffel sends it; cap it so we never sit on
        // the request longer than the user will wait for the bags/seats step.
        const retryAfter = Number(offerRequestRes.headers.get('retry-after'));
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.min(retryAfter * 1000, 2000)
            : 400 * attempt;
        console.warn(`[offer-refresh] Duffel ${offerRequestRes.status}; retrying in ${waitMs}ms (attempt ${attempt}/${MAX_ATTEMPTS})`);
        await new Promise(resolve => setTimeout(resolve, waitMs));
    }

    if (!offerRequestRes || !offerRequestRes.ok) {
        const status = offerRequestRes?.status ?? 0;
        const err = await offerRequestRes?.json().catch(() => ({}));
        const msg = err?.errors?.[0]?.message ?? `Duffel offer_request error ${status}`;
        console.error('[offer-refresh] Duffel offer_request failed:', msg);
        return NextResponse.json({
            success: false,
            reason: status === 429 ? 'upstream_rate_limited' : 'upstream_error',
            error: msg,
        });
    }

    const offerRequestJson = await offerRequestRes.json();
    const offers: any[] = offerRequestJson.data?.offers ?? [];

    if (offers.length === 0) {
        return NextResponse.json({
            success: false,
            reason: 'no_offers',
            error: 'No offers returned for this itinerary',
        });
    }

    // Find best match: same airline + flight number → else cheapest
    let matched = targetFlightNumber
        ? offers.find(o =>
            o.slices[0]?.segments[0] &&
            `${o.slices[0].segments[0].marketing_carrier?.iata_code}${o.slices[0].segments[0].marketing_carrier_flight_number}` === targetFlightNumber
        )
        : null;

    if (!matched && targetAirlineCode) {
        matched = offers.find(o =>
            o.slices[0]?.segments[0]?.marketing_carrier?.iata_code === targetAirlineCode
        );
    }

    if (!matched) {
        // Fall back to cheapest offer
        matched = offers.reduce((best: any, o: any) =>
            parseFloat(o.total_amount) < parseFloat(best.total_amount) ? o : best
        );
    }

    const tripType = matched.slices.length > 1 ? 'round-trip' : 'one-way';
    const normalized = parseDuffelOffer(matched, cabinClass);
    const flightOffer = normalizedToFlightOffer(normalized, tripType);

    console.log(`[offer-refresh] Refreshed offer ${rawOffer.id} → ${matched.id} (${targetFlightNumber ?? 'cheapest'})`);

    return NextResponse.json({ success: true, newOfferId: matched.id, newOffer: flightOffer });
}
