import { FlightResult, FlightSearchParams } from "@/types/flights";
import { env } from "@/utils/env";

/**
 * Duffel provider adapter.
 * Handles communication with the Duffel API and transforms results to our unified format.
 */
export async function searchDuffel(params: FlightSearchParams): Promise<FlightResult[]> {
    const DUFFEL_API_URL = "https://api.duffel.com/air/offer_requests";
    const token = env.DUFFEL_TOKEN;
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

    try {
        const response = await fetch(DUFFEL_API_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Duffel-Version": "2021-12-01",
                "Content-Type": "application/json"
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Duffel API Error: ${response.status} - ${JSON.stringify(errorData)}`);
        }

        const json = await response.json();
        const offers = json.data?.offers || [];

        // 3. Normalize Results
        return offers.map((offer: any): FlightResult => {
            const slice = offer.slices[0];
            const segment = slice.segments[0]; // Simplification for MVP: take first segment

            return {
                provider: "duffel",
                offer_id: offer.id,
                price: parseFloat(offer.total_amount),
                currency: offer.total_currency,
                airline: offer.owner.name,
                departure_time: segment.departing_at,
                arrival_time: slice.segments[slice.segments.length - 1].arriving_at,
                duration: parseDuffelDuration(slice.duration),
                stops: slice.segments.length - 1,
                remaining_seats: offer.available_seats || null,
                raw: offer
            };
        });

    } catch (error: any) {
        console.error("[Duffel] Search failed:", error.message);
        throw error;
    }
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
