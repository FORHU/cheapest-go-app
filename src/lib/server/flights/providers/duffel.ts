import { FlightResult, FlightSearchParams } from "@/types/flights";
import { env } from "@/utils/env";
import { logApiCall } from "@/lib/server/api-logger";

/**
 * Duffel provider adapter.
 * Handles communication with the Duffel API and transforms results to our unified format.
 */
export async function searchDuffel(params: FlightSearchParams): Promise<FlightResult[]> {
    const DUFFEL_API_URL = "https://api.duffel.com/air/offer_requests";
    const token = env.DUFFEL_TOKEN;

    if (!token) {
        console.warn("[Duffel] Missing DUFFEL_ACCESS_TOKEN — skipping");
        return [];
    }

    console.log(`[Duffel] Starting search: ${params.origin} -> ${params.destination} (${params.departureDate})`);

    // 1. Prepare Passengers
    const passengers = [
        ...Array(params.adults).fill({ type: "adult" }),
        ...Array(params.children).fill({ type: "child" }),
        ...Array(params.infants).fill({ type: "infant_without_seat" })
    ];

    // 2. Prepare Request Body
    const slices: { origin: string; destination: string; departure_date: string }[] = [
        { origin: params.origin, destination: params.destination, departure_date: params.departureDate },
    ];
    if (params.returnDate) {
        slices.push({ origin: params.destination, destination: params.origin, departure_date: params.returnDate });
    }

    const body = {
        data: {
            slices,
            passengers,
            cabin_class: params.cabinClass === "premium_economy" ? "premium_economy" :
                params.cabinClass === "business" ? "business" :
                    params.cabinClass === "first" ? "first" : "economy",
            return_offers: true
        }
    };

    const startMs = Date.now();

    try {
        const response = await fetch(DUFFEL_API_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Duffel-Version": "v2",
                "Content-Type": "application/json"
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(10000)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const errMsg = `Duffel API Error: ${response.status} - ${JSON.stringify(errorData)}`;
            console.error(`[Duffel] API error (${response.status}):`, errMsg);
            logApiCall({
                provider: 'duffel', endpoint: DUFFEL_API_URL,
                requestParams: { origin: params.origin, destination: params.destination, departureDate: params.departureDate, returnDate: params.returnDate, adults: params.adults, children: params.children, infants: params.infants, cabinClass: params.cabinClass },
                responseStatus: response.status, durationMs: Date.now() - startMs,
                errorMessage: errMsg, searchId: params.searchId,
            });
            return [];
        }

        const json = await response.json();
        const offers = json.data?.offers || [];

        // 3. Normalize Results
        const results = offers.map((offer: any) => parseDuffelOffer(offer, params.cabinClass));

        logApiCall({
            provider: 'duffel', endpoint: DUFFEL_API_URL,
            requestParams: { origin: params.origin, destination: params.destination, departureDate: params.departureDate, returnDate: params.returnDate, adults: params.adults, cabinClass: params.cabinClass },
            responseStatus: 200, durationMs: Date.now() - startMs,
            responseSummary: { resultCount: results.length },
            searchId: params.searchId,
        });

        return results;

    } catch (error: any) {
        logApiCall({
            provider: 'duffel', endpoint: DUFFEL_API_URL,
            requestParams: { origin: params.origin, destination: params.destination, departureDate: params.departureDate },
            durationMs: Date.now() - startMs,
            errorMessage: error.message, searchId: params.searchId,
        });
        console.error("[Duffel] Search failed:", error.message);
        return [];
    }
}

export function parseDuffelOffer(offer: any, cabinClassFallback?: string) {
    const allSegments: any[] = [];
    
    offer.slices.forEach((slice: any, sliceIdx: number) => {
        slice.segments.forEach((seg: any) => {
            allSegments.push({
                segmentIndex: sliceIdx,
                airline: seg.operating_carrier?.iata_code || seg.marketing_carrier?.iata_code,
                airlineName: seg.operating_carrier?.name || seg.marketing_carrier?.name,
                origin: seg.origin.iata_code,
                destination: seg.destination.iata_code,
                flightNumber: `${seg.marketing_carrier.iata_code}${seg.marketing_carrier_flight_number}`,
                departure: {
                    airport: seg.origin.iata_code,
                    terminal: seg.origin_terminal,
                    time: seg.departing_at
                },
                arrival: {
                    airport: seg.destination.iata_code,
                    terminal: seg.destination_terminal,
                    time: seg.arriving_at
                },
                duration: parseDuffelDuration(seg.duration),
                stops: 0,
                aircraft: seg.aircraft?.name,
                cabinClass: seg.passengers?.[0]?.cabin_class || cabinClassFallback
            });
        });
    });

    const firstSeg = allSegments[0];
    const lastSeg = allSegments[allSegments.length - 1];

    const refundCond = offer.conditions?.refund_before_departure;
    const changeCond = offer.conditions?.change_before_departure;
    const isRefundable = refundCond?.allowed === true;
    const isChangeable = changeCond?.allowed === true;
    const refundPenalty = refundCond?.penalty_amount != null ? parseFloat(refundCond.penalty_amount) : null;
    const changePenalty = changeCond?.penalty_amount != null ? parseFloat(changeCond.penalty_amount) : null;

    return {
        provider: "duffel",
        offer_id: offer.id,
        price: parseFloat(offer.total_amount),
        currency: offer.total_currency,
        airline: offer.owner.name,
        departure_time: firstSeg?.departure?.time,
        arrival_time: lastSeg?.arrival?.time,
        duration: offer.slices.reduce((acc: number, s: any) => acc + parseDuffelDuration(s.duration), 0),
        stops: offer.slices.reduce((acc: number, s: any) => acc + (s.segments.length - 1), 0),
        remaining_seats: offer.available_seats || null,
        segments: allSegments,
        refundable: isRefundable,
        farePolicy: {
            isRefundable,
            isChangeable,
            refundPenaltyAmount: refundPenalty,
            refundPenaltyCurrency: refundCond?.penalty_currency ?? null,
            changePenaltyAmount: changePenalty,
            changePenaltyCurrency: changeCond?.penalty_currency ?? null,
            policyVersion: 'search' as const,
            policySource: 'duffel' as const,
        },
        raw: offer
    } as any;
}

/**
 * Parses ISO8601 duration (e.g. PT2H30M) into total minutes.
 */
function parseDuffelDuration(duration: string): number {
    const matches = duration.match(/P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?/);
    if (!matches) return 0;

    const days = parseInt(matches[1] || '0');
    const hours = parseInt(matches[2] || '0');
    const minutes = parseInt(matches[3] || '0');

    return (days * 24 * 60) + (hours * 60) + minutes;
}
