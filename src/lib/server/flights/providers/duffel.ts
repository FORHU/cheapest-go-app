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

    // ── Fix 1: Reject past dates before hitting Duffel (422 prevention) ────────
    // Duffel requires departure_date >= today. Use UTC date to avoid timezone drift.
    const todayUTC = new Date().toISOString().slice(0, 10);
    if (params.departureDate < todayUTC) {
        console.warn(`[Duffel] Skipping — departure_date ${params.departureDate} is in the past (today: ${todayUTC})`);
        return [];
    }
    if (params.returnDate && params.returnDate < params.departureDate) {
        console.warn(`[Duffel] Skipping — returnDate ${params.returnDate} is before departureDate ${params.departureDate}`);
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

    // ── Fix 2 & 3: Retry on 429 (rate limit) and 500 (transient error) ─────────
    const MAX_RETRIES = 2;
    let lastStatus = 0;
    let lastErrMsg = '';

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await fetch(DUFFEL_API_URL, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Duffel-Version": "v2",
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(12000),
            });

            lastStatus = response.status;

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                lastErrMsg = `Duffel API Error: ${response.status} - ${JSON.stringify(errorData)}`;

                // 429 — respect Retry-After header, then retry
                if (response.status === 429 && attempt < MAX_RETRIES) {
                    const retryAfter = parseInt(response.headers.get('Retry-After') ?? '5', 10);
                    const waitMs = Math.min(retryAfter * 1000, 10_000); // cap at 10s
                    console.warn(`[Duffel] Rate limited (429). Waiting ${waitMs}ms before retry ${attempt + 1}/${MAX_RETRIES}`);
                    await new Promise(r => setTimeout(r, waitMs));
                    continue;
                }

                // 500 — transient server error, retry after brief backoff
                if (response.status === 500 && attempt < MAX_RETRIES) {
                    const waitMs = 2000 * (attempt + 1); // 2s, 4s
                    console.warn(`[Duffel] Server error (500). Retrying in ${waitMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
                    await new Promise(r => setTimeout(r, waitMs));
                    continue;
                }

                console.error(`[Duffel] API error (${response.status}):`, lastErrMsg);
                logApiCall({
                    provider: 'duffel', endpoint: DUFFEL_API_URL,
                    requestParams: { origin: params.origin, destination: params.destination, departureDate: params.departureDate, returnDate: params.returnDate, adults: params.adults, cabinClass: params.cabinClass },
                    responseStatus: response.status, durationMs: Date.now() - startMs,
                    errorMessage: lastErrMsg, searchId: params.searchId,
                });
                return [];
            }

            const json = await response.json();
            const offers = json.data?.offers || [];
            const results = offers.map((offer: any) => parseDuffelOffer(offer, params.cabinClass));

            logApiCall({
                provider: 'duffel', endpoint: DUFFEL_API_URL,
                requestParams: { origin: params.origin, destination: params.destination, departureDate: params.departureDate, returnDate: params.returnDate, adults: params.adults, cabinClass: params.cabinClass },
                responseStatus: 200, durationMs: Date.now() - startMs,
                responseSummary: { resultCount: results.length, attempts: attempt + 1 },
                searchId: params.searchId,
            });

            return results;

        } catch (error: any) {
            const isTimeout = error.name === 'TimeoutError' || error.name === 'AbortError';

            // Retry timeouts (500-equivalent transient failures)
            if (isTimeout && attempt < MAX_RETRIES) {
                const waitMs = 1500 * (attempt + 1);
                console.warn(`[Duffel] Timeout on attempt ${attempt + 1}. Retrying in ${waitMs}ms`);
                await new Promise(r => setTimeout(r, waitMs));
                continue;
            }

            logApiCall({
                provider: 'duffel', endpoint: DUFFEL_API_URL,
                requestParams: { origin: params.origin, destination: params.destination, departureDate: params.departureDate },
                durationMs: Date.now() - startMs,
                errorMessage: error.message, searchId: params.searchId,
            });
            console.error("[Duffel] Search failed after retries:", error.message);
            return [];
        }
    }

    // Exhausted retries
    console.error(`[Duffel] Giving up after ${MAX_RETRIES} retries. Last status: ${lastStatus}`);
    return [];
}

export function parseDuffelOffer(offer: any, cabinClassFallback?: string) {
    const allSegments: any[] = [];
    
    offer.slices.forEach((slice: any, sliceIdx: number) => {
        slice.segments.forEach((seg: any) => {
            allSegments.push({
                // Which leg this belongs to. Kept distinct from the flat position
                // assigned during normalisation, which cannot express grouping.
                sliceIndex: sliceIdx,
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
