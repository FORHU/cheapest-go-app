import type { FlightOffer } from '@/types/flights';

/**
 * Client-side cache of the last successful flight search, keyed by the search
 * itself and held in `sessionStorage`.
 *
 * It exists for one navigation in particular: results → book → browser Back.
 * The results page (`SearchFetcher`) re-runs its search on every mount, and the
 * App Router remounts it on back-navigation. Without this cache that Back button
 * fires a fresh provider search seconds after the first — the burst that trips
 * Duffel's account-level rate limit — and a rate-limited retry comes back empty,
 * replacing the results the traveller was just looking at with "No flights found".
 *
 * Entries are deliberately short-lived. A provider offer id is a quote that dies
 * ~20-30 min after issue, and the booking page revalidates the chosen offer
 * before payment, so handing a few-minute-old list back to someone stepping
 * backwards is safe where replaying it into a booking would not be.
 */

const PREFIX = 'flightSearchResult:';

/** How long a cached result may still be served on a back-navigation. */
export const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;

export interface SearchCacheKeyParts {
    origin: string;
    destination: string;
    departureDate: string;
    returnDate?: string;
    adults: number;
    children: number;
    infants: number;
    cabinClass: string;
}

/** A stable key for one search — every field the provider request depends on. */
export function searchCacheKey(p: SearchCacheKeyParts): string {
    return PREFIX + [
        p.origin,
        p.destination,
        p.departureDate,
        p.returnDate ?? '',
        p.adults,
        p.children,
        p.infants,
        p.cabinClass,
    ].join('|');
}

interface CacheEntry {
    ts: number;
    offers: FlightOffer[];
}

/**
 * The cached offers for `key`, or null when there is no usable entry — never
 * seen, expired, or corrupt. A stale entry is removed as a side effect so it
 * cannot linger.
 */
export function readSearchCache(key: string, now: number = Date.now()): FlightOffer[] | null {
    try {
        const raw = sessionStorage.getItem(key);
        if (!raw) return null;

        const entry = JSON.parse(raw) as CacheEntry | null;
        if (!entry || !Array.isArray(entry.offers) || entry.offers.length === 0) return null;

        if (now - entry.ts > SEARCH_CACHE_TTL_MS) {
            sessionStorage.removeItem(key);
            return null;
        }

        return entry.offers;
    } catch {
        return null;
    }
}

/**
 * Remember a successful search. Empty results are never stored — the whole point
 * is to have something to show, and "nothing" is exactly the state this guards
 * against. A `sessionStorage` write that fails (quota, private mode) is swallowed:
 * a missing entry just means the next back-navigation re-searches, the old
 * behaviour.
 */
export function writeSearchCache(key: string, offers: FlightOffer[], now: number = Date.now()): void {
    try {
        if (!Array.isArray(offers) || offers.length === 0) return;
        sessionStorage.setItem(key, JSON.stringify({ ts: now, offers } satisfies CacheEntry));
    } catch {
        // no-op — see doc comment
    }
}
