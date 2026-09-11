import { FlightResult, FlightSearchParams } from "@/types/flights";
import { env } from "@/utils/env";
import { logApiCall } from "@/lib/server/api-logger";
import { PROVIDER_ATTEMPT_TIMEOUT_MS, PROVIDER_RETRY_BACKOFF_MS } from "@/lib/flights/search-budget";

/**
 * The provider tried and could not answer — a 429, a 5xx, a timeout, an
 * unreachable host. Distinct from an empty offer list, which is a real answer
 * about the route. The orchestrator turns this into a named `failedProviders`
 * entry so the results page can offer a retry instead of telling the traveller
 * "No flights found" over what is actually an outage.
 */
export class DuffelSearchError extends Error {
    constructor(message: string, readonly status?: number) {
        super(message);
        this.name = "DuffelSearchError";
    }
}

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
    // Duffel requires departure_date >= today. Server runs UTC; departureDate is
    // the user's local YYYY-MM-DD (emitted correctly by useFlightSearch).
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
    // The ladder is sized in @/lib/flights/search-budget so the orchestrator's
    // ceiling and the browser's abort are derived from it rather than guessed
    // alongside it — see the note there on the 12s-versus-12s race.
    const MAX_RETRIES = PROVIDER_RETRY_BACKOFF_MS.length;
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
                signal: AbortSignal.timeout(PROVIDER_ATTEMPT_TIMEOUT_MS),
            });

            lastStatus = response.status;

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                lastErrMsg = `Duffel API Error: ${response.status} - ${JSON.stringify(errorData)}`;

                // 500 — transient server error, retry after brief backoff
                if (response.status === 500 && attempt < MAX_RETRIES) {
                    const waitMs = PROVIDER_RETRY_BACKOFF_MS[attempt];
                    console.warn(`[Duffel] Server error (500). Retrying in ${waitMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
                    await new Promise(r => setTimeout(r, waitMs));
                    continue;
                }

                // 429 — account-level rate limit; retrying immediately just generates
                // more 429s, so this one never retries. Every other non-OK status that
                // reaches here is a failure the caller must be able to see: fall through
                // to the throw below rather than returning an empty list that reads as
                // "no flights on this route".
                if (response.status === 429) {
                    const retryAfter = response.headers.get('Retry-After') ?? 'unknown';
                    console.warn(`[Duffel] Rate limited (429). Retry-After: ${retryAfter}s. Search for ${params.origin}->${params.destination} not attempted further.`);
                } else {
                    console.error(`[Duffel] API error (${response.status}):`, lastErrMsg);
                }
                logApiCall({
                    provider: 'duffel', endpoint: DUFFEL_API_URL,
                    requestParams: { origin: params.origin, destination: params.destination, departureDate: params.departureDate, returnDate: params.returnDate, adults: params.adults, cabinClass: params.cabinClass },
                    responseStatus: response.status, durationMs: Date.now() - startMs,
                    errorMessage: lastErrMsg, searchId: params.searchId,
                });
                break;
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
            lastErrMsg = error.message;

            // Retry timeouts (500-equivalent transient failures)
            if (isTimeout && attempt < MAX_RETRIES) {
                const waitMs = PROVIDER_RETRY_BACKOFF_MS[attempt];
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
            break;
        }
    }

    // Reached only when every attempt failed. Throwing — rather than returning [] —
    // is what lets the orchestrator name Duffel in `failedProviders`, so the page
    // shows a retryable "providers unreachable" state instead of "No flights found".
    console.error(`[Duffel] Giving up after ${MAX_RETRIES} retr${MAX_RETRIES === 1 ? 'y' : 'ies'}. Last status: ${lastStatus}`);
    throw new DuffelSearchError(
        `Duffel search failed${lastStatus ? ` (HTTP ${lastStatus})` : ''}: ${lastErrMsg || 'no response'}`,
        lastStatus || undefined,
    );
}

export function parseDuffelOffer(offer: any, cabinClassFallback?: string) {
    const allSegments: any[] = [];
    
    offer.slices.forEach((slice: any, sliceIdx: number) => {
        slice.segments.forEach((seg: any) => {
            const marketingCode = seg.marketing_carrier?.iata_code ?? '';
            const operatingCode = seg.operating_carrier?.iata_code ?? '';
            allSegments.push({
                segmentIndex: sliceIdx,
                // The Marketing Carrier is the brand the seat was sold under — that is what
                // the traveller booked. This used to read the operating carrier while the
                // flight number below read the marketing one, so a codeshare showed the
                // wrong airline's name beside the right airline's flight number.
                airline: marketingCode || operatingCode,
                airlineName: seg.marketing_carrier?.name || seg.operating_carrier?.name,
                // Only present on a codeshare. Absent means the brand flies its own metal.
                operatingAirline: operatingCode && operatingCode !== marketingCode
                    ? {
                        code: operatingCode,
                        name: seg.operating_carrier?.name ?? '',
                        flightNumber: seg.operating_carrier_flight_number
                            ? `${operatingCode}${seg.operating_carrier_flight_number}`
                            : '',
                    }
                    : undefined,
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
                cabinClass: seg.passengers?.[0]?.cabin_class || cabinClassFallback,
                baggage: segmentBaggage(seg)
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

    const baggage = extractBaggageAllowance(offer);

    const totalAmount = parseFloat(offer.total_amount);
    // Duffel total_amount covers all passengers. Divide by adult count for per-person display.
    const numAdults = (offer.passengers ?? []).filter((p: any) => p.type === 'adult').length || 1;
    const pricePerAdult = numAdults > 1 ? Math.round(totalAmount / numAdults) : totalAmount;

    return {
        provider: "duffel",
        offer_id: offer.id,
        price: totalAmount,
        pricePerAdult,
        currency: offer.total_currency,
        airline: offer.owner.name,
        departure_time: firstSeg?.departure?.time,
        arrival_time: lastSeg?.arrival?.time,
        duration: offer.slices.reduce((acc: number, s: any) => acc + parseDuffelDuration(s.duration), 0),
        // One elapsed time per slice, exactly as Duffel quotes it — connection time
        // included, and correct across timezones in a way arrival-minus-departure is not.
        sliceDurations: offer.slices.map((s: any) => parseDuffelDuration(s.duration)),
        stops: offer.slices.reduce((acc: number, s: any) => acc + (s.segments.length - 1), 0),
        remaining_seats: offer.available_seats || null,
        segments: allSegments,
        refundable: isRefundable,
        baggage,
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
 * Included baggage allowance for an offer, as carry-on and checked bag counts.
 *
 * Duffel reports the allowance per segment per passenger, and the segments of one
 * offer do not have to agree — a fare can include a checked bag on the long leg and
 * none on the connection. A traveller only actually has the smallest allowance on
 * any leg, so we take the minimum across segments rather than reading the first one.
 * Advertising a bag the second leg would refuse is worse than advertising none.
 *
 * Distinguishes "no free bag" (quantity 0 — a fact worth showing) from "the airline
 * told us nothing" (returns undefined, and the badge is omitted rather than guessed).
 */
function segmentBaggage(seg: any): { carryOnBags: number; checkedBags: number } | undefined {
    const bags = seg?.passengers?.[0]?.baggages;
    if (!Array.isArray(bags)) return undefined;

    let carryOnBags = 0;
    let checkedBags = 0;
    for (const bag of bags) {
        const qty = Number(bag?.quantity) || 0;
        if (bag?.type === 'carry_on') carryOnBags += qty;
        else if (bag?.type === 'checked') checkedBags += qty;
    }
    return { carryOnBags, checkedBags };
}

function extractBaggageAllowance(offer: any): { carryOnBags?: number; checkedBags?: number } | undefined {
    let carryOn: number | null = null;
    let checked: number | null = null;

    for (const slice of offer.slices ?? []) {
        for (const seg of slice.segments ?? []) {
            const bags = segmentBaggage(seg);
            if (!bags) continue;

            carryOn = carryOn === null ? bags.carryOnBags : Math.min(carryOn, bags.carryOnBags);
            checked = checked === null ? bags.checkedBags : Math.min(checked, bags.checkedBags);
        }
    }

    if (carryOn === null && checked === null) return undefined;
    return {
        ...(carryOn !== null ? { carryOnBags: carryOn } : {}),
        ...(checked !== null ? { checkedBags: checked } : {}),
    };
}

/**
 * Parses an ISO 8601 duration (e.g. `PT2H30M`) into total minutes.
 *
 * The `T` is optional, because Duffel really does send day-only durations: a slice of
 * exactly one day comes back as `P1D`, with no time component at all. Requiring the `T`
 * made that string unmatchable, so a 24-hour slice was read as zero minutes — invisible
 * while slice durations were only ever summed, and a blank duration once each slice is
 * shown on its own row. Anchored, so a malformed string fails outright rather than
 * matching some prefix of itself.
 */
export function parseDuffelDuration(duration: string): number {
    if (!duration) return 0;
    const matches = duration.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(?:\d+(?:\.\d+)?)S)?)?$/);
    if (!matches) return 0;

    const days = parseInt(matches[1] || '0');
    const hours = parseInt(matches[2] || '0');
    const minutes = parseInt(matches[3] || '0');

    return (days * 24 * 60) + (hours * 60) + minutes;
}
