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

    // Create new offer request
    const offerRequestRes = await fetch('https://api.duffel.com/air/offer_requests', {
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

    if (!offerRequestRes.ok) {
        const err = await offerRequestRes.json().catch(() => ({}));
        const msg = err?.errors?.[0]?.message ?? `Duffel offer_request error ${offerRequestRes.status}`;
        console.error('[offer-refresh] Duffel offer_request failed:', msg);
        return NextResponse.json({ success: false, error: msg }, { status: offerRequestRes.status });
    }

    const offerRequestJson = await offerRequestRes.json();
    const offers: any[] = offerRequestJson.data?.offers ?? [];

    if (offers.length === 0) {
        return NextResponse.json({ success: false, error: 'No offers returned for this itinerary' }, { status: 404 });
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
