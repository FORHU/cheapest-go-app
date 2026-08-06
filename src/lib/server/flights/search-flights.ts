import { FlightSearchParams, FlightSearch, FlightOffer, FlightResult } from "@/types/flights";
import { searchDuffel } from "./providers/duffel";
import { createClient } from "@/utils/postgres/server";
import { normalizedToFlightOffer } from "@/utils/flight-utils";

/**
 * Helper to wrap a promise with a timeout.
 */
async function withTimeout<T>(promise: Promise<T>, ms: number, providerName: string): Promise<T> {
    const timeout = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`[Timeout] ${providerName} exceeded ${ms}ms`)), ms);
    });
    return Promise.race([promise, timeout]);
}

/**
 * Main orchestrator for flight searches.
 *
 * Always live: every search goes straight to the providers. Offers are never
 * served from the database.
 *
 * A stored result carries the provider's offer id, and those ids are quotes with
 * an expiry — a Duffel offer dies roughly 20-30 minutes after it is issued.
 * Replaying a stored row therefore hands the traveller a price whose offer no
 * longer exists at the supplier: the booking gets as far as order placement,
 * fails with `offer_no_longer_available`, and the auto-refresh has to re-quote
 * from scratch, landing on a different price. A cache hit here bought a faster
 * search at the cost of an unbookable one.
 *
 * `flight_results_cache` is still written below — the price calendar reads it as
 * price history — it just never answers a search.
 */
export async function searchFlights(params: FlightSearchParams): Promise<FlightOffer[]> {
    const TIMEOUT_MS = 12000; // 12 seconds

    // Create the search record up front so the results written at the end have
    // something to hang off.
    let searchId = params.searchId;
    if (!searchId) {
        const saved = await saveSearch(params).catch(() => ({ id: undefined }));
        searchId = (saved as any).id;
    }

    // Fetch from providers in parallel with resilience (allSettled)
    const providers = [
        { name: "Duffel", call: searchDuffel(params) },
    ];

    const settlement = await Promise.allSettled(
        providers.map(p => withTimeout(p.call, TIMEOUT_MS, p.name))
    );

    // Extract results from fulfilled promises
    const allResults = settlement
        .filter((r): r is PromiseFulfilledResult<FlightResult[]> => r.status === "fulfilled")
        .flatMap(r => r.value);

    // Log failures/timeouts for observability
    settlement.forEach((r, i) => {
        if (r.status === "rejected") {
            const providerName = providers[i].name;
            console.error(`[Search] ${providerName} failed:`, r.reason.message || r.reason);
        }
    });

    // Persist results — fire-and-forget so it never blocks the search response.
    // This feeds the price calendar's history; it is never read back as a search result.
    if (allResults.length > 0 && searchId) {
        cacheResults(searchId, allResults).catch(err =>
            console.error("[Cache] Background result write failed:", err.message)
        );

        logSearchAnalytics(params, allResults).catch(err =>
            console.error("[Analytics] Logging failed:", err.message)
        );
    }

    // Return aggregated and unified results
    return allResults.map(r => normalizedToFlightOffer(r, params.returnDate ? 'round-trip' : 'one-way'));
}



/**
 * Logs search demand and computed price trends to stats table.
 */
async function logSearchAnalytics(params: FlightSearchParams, results: FlightResult[]): Promise<void> {
    if (results.length === 0) return;

    const supabase = await createClient();
    
    // Compute metrics
    const prices = results.map(r => r.price);
    const minPrice = Math.min(...prices);
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;

    // Call RPC for atomic upsert
    const { error } = await supabase.rpc('increment_search_stats', {
        p_origin: params.origin,
        p_destination: params.destination,
        p_min_price: minPrice,
        p_avg_price: avgPrice
    });

    if (error) throw error;
}

/**
 * Saves a user search intent to the database.
 */
export async function saveSearch(params: FlightSearchParams): Promise<FlightSearch> {
    const supabase = await createClient();
    
    const { data, error } = await supabase
        .from('flight_searches')
        .insert({
            origin: params.origin,
            destination: params.destination,
            departure_date: params.departureDate,
            return_date: params.returnDate ?? null,
            adults: params.adults,
            children: params.children ?? 0,
            infants: params.infants ?? 0,
            cabin_class: params.cabinClass
        })
        .select()
        .single();

    if (error) throw new Error(`Failed to save search: ${error.message}`);
    return data as FlightSearch;
}

/**
 * Caches flight results for a specific search.
 * Inserts in chunks of 50 to avoid Supabase statement timeouts on large result sets.
 */
export async function cacheResults(searchId: string, results: FlightResult[]): Promise<void> {
    const supabase = await createClient();
    const CHUNK_SIZE = 50;

    const rows = results.map(r => ({
        id: crypto.randomUUID(),
        search_id: searchId,
        provider: r.provider,
        offer_id: r.offer_id,
        price: r.price,
        currency: r.currency,
        airline: r.airline,
        departure_time: r.departure_time,
        arrival_time: r.arrival_time,
        duration: r.duration,
        stops: r.stops ?? 0,
        refundable: (r as any).refundable ?? false,
        raw: r.raw,
    }));

    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        const chunk = rows.slice(i, i + CHUNK_SIZE);
        const { error } = await supabase.from('flight_results_cache').insert(chunk);
        if (error) {
            console.error(`[Cache] Failed to cache chunk ${i / CHUNK_SIZE + 1}:`, error.message);
            // Don't abort — partial cache is better than none
        }
    }
}
