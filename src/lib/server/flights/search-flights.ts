import { FlightResultCache, FlightSearchParams, FlightSearch, FlightOffer } from "@/types/flights";
import { searchDuffel } from "./providers/duffel";
import { searchMystifly } from "./providers/mystifly";
import { createClient } from "@/utils/supabase/server"; 
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
 * Implements caching logic and provider aggregation.
 */
export async function searchFlights(params: FlightSearchParams): Promise<FlightOffer[]> {
    const TIMEOUT_MS = 15000; // 15 seconds
    const TTL_MINUTES = 10;

    // 1. PERFORMANCE: Check for valid cached results first
    const cachedResults = await getExistingCachedResults(params, TTL_MINUTES);
    if (cachedResults && cachedResults.length > 0) {
        console.log(`[Cache] Found valid hit for ${params.origin}->${params.destination} (TTL: ${TTL_MINUTES}m)`);
        return cachedResults.map(r => normalizedToFlightOffer(r, params.returnDate ? 'round-trip' : 'one-way'));
    }

    // 2. Fetch from providers in parallel with resilience (allSettled)
    const providers = [
        { name: "Duffel", call: searchDuffel(params) },
        { name: "Mystifly", call: searchMystifly(params) }
    ];

    const settlement = await Promise.allSettled(
        providers.map(p => withTimeout(p.call, TIMEOUT_MS, p.name))
    );

    // Extract results from fulfilled promises
    const allResults = settlement
        .filter((r): r is PromiseFulfilledResult<FlightResultCache[]> => r.status === "fulfilled")
        .flatMap(r => r.value);
        
    // Log failures/timeouts for observability
    settlement.forEach((r, i) => {
        if (r.status === "rejected") {
            const providerName = providers[i].name;
            console.error(`[Search] ${providerName} failed:`, r.reason.message || r.reason);
        }
    });

    // 3. Update cache with new results
    if (allResults.length > 0 && params.searchId) {
        await cacheResults(params.searchId, allResults);
        
        // 4. Log Analytics (Phase 11) - Fire and forget
        logSearchAnalytics(params, allResults).catch(err => 
            console.error("[Analytics] Logging failed:", err.message)
        );
    }

    // 5. Return aggregated and unified results
    return allResults.map(r => normalizedToFlightOffer(r, params.returnDate ? 'round-trip' : 'one-way'));
}

/**
 * Checks for recently cached results (Deduplication).
 */
async function getExistingCachedResults(params: FlightSearchParams, ttlMinutes: number): Promise<FlightResultCache[] | null> {
    const supabase = await createClient();
    
    // Find a recent identical search record
    const { data: recentSearches, error: searchError } = await supabase
        .from('flight_searches')
        .select('id, created_at')
        .eq('origin', params.origin)
        .eq('destination', params.destination)
        .eq('departure_date', params.departureDate)
        .eq('cabin_class', params.cabinClass)
        .order('created_at', { ascending: false })
        .limit(1);

    if (searchError || !recentSearches || recentSearches.length === 0) return null;

    const lastSearch = recentSearches[0];
    const createdTime = new Date(lastSearch.created_at).getTime();
    const now = new Date().getTime();
    const diffMinutes = (now - createdTime) / (1000 * 60);

    if (diffMinutes > ttlMinutes) return null;

    // Fetch the cached results for this search ID
    const { data: results, error: resultsError } = await supabase
        .from('flight_results_cache')
        .select('*')
        .eq('search_id', lastSearch.id);

    if (resultsError || !results) return null;

    return results as FlightResultCache[];
}

/**
 * Logs search demand and computed price trends to stats table.
 */
async function logSearchAnalytics(params: FlightSearchParams, results: FlightResultCache[]): Promise<void> {
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
            return_date: params.returnDate,
            adults: params.adults,
            children: params.children,
            infants: params.infants,
            cabin_class: params.cabinClass
        })
        .select()
        .single();

    if (error) throw new Error(`Failed to save search: ${error.message}`);
    return data as FlightSearch;
}

/**
 * Caches flight results for a specific search.
 */
export async function cacheResults(searchId: string, results: FlightResultCache[]): Promise<void> {
    const supabase = await createClient();

    const { error } = await supabase
        .from('flight_results_cache')
        .insert(
            results.map(r => ({
                search_id: searchId,
                provider: r.provider,
                offer_id: r.offer_id,
                price: r.price,
                currency: r.currency,
                airline: r.airline,
                departure_time: r.departure_time,
                arrival_time: r.arrival_time,
                duration: r.duration,
                raw: r.raw
            }))
        );

    if (error) {
        console.error("[Cache] Failed to cache results:", error.message);
    }
}
