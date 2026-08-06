import { createAdminClient } from '@/utils/postgres/admin';
import { cache } from "react";
import { type Deal, type VacationPackage, type WeekendDeal } from "@/types";
import { env } from "@/utils/env";
import { getAirlineName } from "@/types/flights";
import {
    DESTINATION_PRICE_MARKUP,
    DESTINATION_INCLUDES_DEFAULT,
    DESTINATION_RATING_DEFAULT,
    DESTINATION_REVIEWS_DEFAULT,
} from "@/lib/constants/landing";

// Public read-only client — no cookies needed for landing page data.
// Using the cookie-based server client here would call cookies() which
// breaks static/ISR prerendering in Next.js 15.
let dbClient: any = null;
function getDbClient() {
    if (!dbClient) {
        dbClient = createAdminClient();
    }
    return dbClient;
}

// ─── Shared helper ────────────────────────────────────────────────────────────
const QUERY_TIMEOUT_MS = 8000;

/** Normalise any date string to YYYY-MM-DD.
 *  Node.js rejects Date.toString() output like "Mon Jun 29 2026 08:00:00 GMT+0800 (Philippine Standard Time)"
 *  because of the parenthesised timezone name — strip it first. */
function toYMD(raw: string | Date | null | undefined): string | undefined {
    if (!raw) return undefined;
    if (raw instanceof Date) return isNaN(raw.getTime()) ? undefined : raw.toISOString().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) return raw.slice(0, 10);
    // Strip " (Timezone Name)" suffix that Node's V8 cannot parse
    const stripped = raw.replace(/\s*\([^)]*\)\s*$/, '').trim();
    const d = new Date(stripped);
    return isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
}

/** Only OTV codes (e.g. "KR2094") and ETG numeric IDs are routable to TGX/OTV.
 *  LiteAPI slug IDs (e.g. "city_residence_park_ivry") were never cleaned up after
 *  the provider migration and will always return 0 rooms — exclude them. */
function isValidHotelCode(code: string | null | undefined): boolean {
    if (!code) return false;
    return /^\d+$/.test(code) || /^[A-Z]{2}\d+$/.test(code);
}

/** Keep the first item for each key — drops content-identical duplicate rows. */
function dedupeBy<T>(items: T[], key: (item: T) => string): T[] {
    const seen = new Set<string>();
    return items.filter(item => {
        const k = key(item).toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    });
}

async function dbQuery(table: string, limit: number) {
    try {
        const db = getDbClient();
        const makeTimeout = (label: string) =>
            new Promise<{ data: null; error: Error }>(resolve =>
                setTimeout(() => resolve({ data: null, error: new Error(`Query timeout: ${label}`) }), QUERY_TIMEOUT_MS)
            );

        const query = db.from(table).select("*");

        const result = await Promise.race([
            query.limit(limit ?? 20),
            makeTimeout(table),
        ]);
        // Only retry on network-level fetch failures, NOT on our own timeout
        if (result.error?.message?.includes("fetch failed") || result.error?.message?.includes("ECONNRESET")) {
            console.log(`[Landing] ECONNRESET on ${table}, resetting pool and retrying...`);
            dbClient = null; // drop stale pool, force fresh connections on retry
            await new Promise(r => setTimeout(r, 200));
            const retryClient = getDbClient();
            const retryResult = await Promise.race([
                retryClient.from(table).select("*").limit(limit),
                makeTimeout(`${table}-retry`),
            ]);
            console.log(`[Landing] Retry ${table} result: error=${retryResult.error?.message ?? 'none'}, rows=${retryResult.data?.length ?? 0}`);
            return retryResult;
        }
        return result;
    } catch (err) {
        console.error(`[Landing] Query threw for ${table}:`, err);
        return { data: null, error: err };
    }
}

// ─── Per-section cached fetchers ─────────────────────────────────────────────
export const getFlightDeals = cache(async (): Promise<Deal[]> => {
    const { data, error } = await dbQuery("flight_deals", 20);
    if (error) console.error("[Landing] flight_deals error:", (error as any).message ?? error);
    const mapped: Deal[] = data?.map((d: any) => ({
        id: String(d.id),
        title: `${d.origin} → ${d.destination}`,
        subtitle: d.airline ? getAirlineName(d.airline) : "Best flexible fares",
        discount: d.discount_tag || "",
        originalPrice: Number(d.baseline_price || d.original_price || 0),
        salePrice: Number(d.price || 0),
        currency: d.currency || 'USD',
        image: d.image_url || (d.destination ? `/api/destination-photo?iata=${encodeURIComponent(d.destination)}` : '/api/destination-photo'),
        endsIn: d.ends_in || "Limited Time",
        origin: d.origin || undefined,
        destination: d.destination || undefined,
        departure_date: toYMD(d.departure_date),
        return_date: toYMD(d.return_date),
        cabinClass: d.cabin_class || 'economy',
        lastRefreshedAt: d.last_refreshed_at || undefined,
    })) ?? [];
    // Drop duplicate fares (same route, airline, cabin, dates and price).
    return dedupeBy(mapped, d =>
        `${d.origin}|${d.destination}|${d.subtitle}|${d.cabinClass}|${d.departure_date}|${d.return_date}|${d.salePrice}`
    );
});

export const getWeekendDeals = cache(async (): Promise<WeekendDeal[]> => {
    const { data, error } = await dbQuery("weekend_flight_deals", 10);
    if (error) console.error("[Landing] weekend_flight_deals error:", (error as any).message ?? error);
    const mapped: WeekendDeal[] = data?.map((d: any) => ({
        id: d.id,
        name: d.name,
        location: d.location,
        rating: Number(d.rating || 0),
        reviews: Number(d.reviews || 0),
        originalPrice: Number(d.original_price || 0),
        salePrice: Number(d.sale_price || 0),
        currency: d.currency || 'PHP',
        image: d.image_url || `/api/hotel-photo?q=${encodeURIComponent(`${d.name} ${d.location}`)}`,
        badge: d.badge,
        guests: Number(d.guests || 0),
        bedrooms: Number(d.bedrooms || 0),
        bathrooms: Number(d.bathrooms || 0),
    })) ?? [];
    // Drop duplicate hotels (same property in the same location).
    return dedupeBy(mapped, d => `${d.name}|${d.location}`);
});

export const getPopularDestinations = cache(async (): Promise<VacationPackage[]> => {
    const { data, error } = await dbQuery("popular_destinations", 12);
    if (error) console.error("[Landing] popular_destinations error:", (error as any).message ?? error);
    return data?.map((d: any) => ({
        id: d.id,
        name: d.city,
        location: d.country,
        image: d.image_url || (
            (d.destination_code || d.iata_code)
                ? `/api/destination-photo?iata=${encodeURIComponent(d.destination_code || d.iata_code)}`
                : `/api/hotel-photo?q=${encodeURIComponent(`${d.city} ${d.country} tourism`)}`
        ),
        originalPrice: Number(d.average_price || 0) * DESTINATION_PRICE_MARKUP,
        salePrice: Number(d.average_price || 0),
        includes: DESTINATION_INCLUDES_DEFAULT,
        rating: DESTINATION_RATING_DEFAULT,
        reviews: DESTINATION_REVIEWS_DEFAULT,
        destinationCode: d.destination_code || d.iata_code || undefined,
    })) ?? [];
});

export const getUniqueStays = cache(async () => {
    const { data, error } = await dbQuery("hotel_deals", 10);
    if (error) console.error("[Landing] hotel_deals error:", (error as any).message ?? error);
    return (data ?? [])
        .filter((d: any) => isValidHotelCode(d.hotel_code))
        .map((d: any) => ({
            id: d.hotel_code,
            name: d.name,
            location: d.location,
            rating: Number(d.rating || 0),
            price: Number(d.price || 0),
            image: d.image_url || `/api/hotel-photo?q=${encodeURIComponent(`${d.name} ${d.location}`)}`,
            badge: d.discount_tag ?? d.badge ?? null,
        }));
});

export const getHotelDeals = cache(async (): Promise<WeekendDeal[]> => {
    const { data, error } = await dbQuery("hotel_deals", 20);
    if (error) console.error("[Landing] hotel_deals error:", (error as any).message ?? error);
    const mapped: WeekendDeal[] = (data ?? [])
        .filter((d: any) => isValidHotelCode(d.hotel_code))
        .map((d: any) => ({
            id: d.hotel_code,
            name: d.name,
            location: d.location,
            rating: Number(d.rating || 0),
            reviews: 0,
            originalPrice: Number(d.baseline_price || d.price || 0),
            salePrice: Number(d.price || 0),
            currency: d.currency || 'USD',
            image: d.image_url || `/api/hotel-photo?hotelCode=${encodeURIComponent(d.hotel_code)}`,
            badge: d.discount_tag ?? null,
            hotelCode: d.hotel_code,
            checkIn: d.check_in ? String(d.check_in).slice(0, 10) : null,
            checkOut: d.check_out ? String(d.check_out).slice(0, 10) : null,
            guests: Number(d.guests || 0),
            bedrooms: Number(d.bedrooms || 0),
            bathrooms: Number(d.bathrooms || 0),
        }));
    return dedupeBy(mapped, d => `${d.name}|${d.location}`);
});

export const getGuestFavorites = cache(async (): Promise<WeekendDeal[]> => {
    let db: any;
    try {
        db = getDbClient();
    } catch (err) {
        console.error('[Landing] guest_favorites error:', (err as Error).message ?? err);
        return [];
    }
    const { data, error } = await Promise.race([
        db
            .from('hotel_deals')
            .select('*')
            .gt('rating', 7)
            .order('rating', { ascending: false })
            .limit(15),
        new Promise<{ data: null; error: Error }>(resolve =>
            setTimeout(() => resolve({ data: null, error: new Error('Query timeout: guest_favorites') }), QUERY_TIMEOUT_MS)
        ),
    ]);
    if (error) console.error('[Landing] guest_favorites error:', (error as any).message ?? error);
    const mapped: WeekendDeal[] = (data ?? [])
        .filter((d: any) => isValidHotelCode(d.hotel_code))
        .map((d: any) => ({
            id: d.hotel_code,
            name: d.name,
            location: d.location,
            rating: Number(d.rating || 0),
            reviews: Number(d.reviews || 0),
            originalPrice: Number(d.baseline_price || d.price || 0),
            salePrice: Number(d.price || 0),
            currency: d.currency || 'USD',
            image: d.image_url || `/api/hotel-photo?hotelCode=${encodeURIComponent(d.hotel_code)}`,
            badge: d.discount_tag ?? null,
            hotelCode: d.hotel_code,
            checkIn: d.check_in ? String(d.check_in).slice(0, 10) : null,
            checkOut: d.check_out ? String(d.check_out).slice(0, 10) : null,
        }));
    return dedupeBy(mapped, d => `${d.name}|${d.location}`);
});

export const getTravelStyles = cache(async () => {
    const { data, error } = await dbQuery("travel_styles", 10);
    if (error) console.error("[Landing] travel_styles error:", (error as any).message ?? error);
    return data?.map((d: any) => ({
        id: d.id,
        title: d.title,
        location: d.location,
        price: Number(d.price || 0),
        image: d.image_url || `/api/hotel-photo?q=${encodeURIComponent(`${d.title} ${d.location} travel`)}`,
    })) ?? [];
});

const EMPTY_RESULT = {
    flightDeals: [] as Deal[],
    weekendDeals: [] as any[],
    popularDestinations: [] as VacationPackage[],
    uniqueStays: [] as any[],
    travelStyles: [] as any[],
};

export const getLandingData = cache(async () => {
    let db: any;
    try {
        db = getDbClient();
    } catch (err) {
        console.error('[Landing] getLandingData: DB unavailable:', (err as Error).message ?? err);
        return EMPTY_RESULT;
    }

    // Helper: query with one retry on network errors (TypeError: fetch failed)
    async function query(table: string, limit: number): Promise<{ data: any[] | null; error: any }> {
        try {
            const result = await db.from(table).select("*").limit(limit);
            if (result.error?.message?.includes("fetch failed") || result.error?.message?.includes("ECONNRESET")) {
                dbClient = null; // drop stale pool
                await new Promise(r => setTimeout(r, 100));
                db = getDbClient();
                return db.from(table).select("*").limit(limit);
            }
            return result;
        } catch (err) {
            console.error(`[Landing] Query threw for ${table}:`, err);
            return { data: null, error: err };
        }
    }

    // Run in two batches to avoid concurrent connection limits
    const [r1, r2] = await Promise.all([
        query("flight_deals", 10),
        query("weekend_flight_deals", 10),
    ]);
    const [r3, r4, r5] = await Promise.all([
        query("popular_destinations", 12),
        query("unique_stays", 10),
        query("travel_styles", 10),
    ]);

    const flightDeals = r1.data;
    const weekendDeals = r2.data;
    const popularDestinations = r3.data;
    const uniqueStays = r4.data;
    const travelStyles = r5.data;

    if (r1.error) console.error("[Landing] flight_deals error:", r1.error.message ?? r1.error);
    if (r2.error) console.error("[Landing] weekend_flight_deals error:", r2.error.message ?? r2.error);
    if (r3.error) console.error("[Landing] popular_destinations error:", r3.error.message ?? r3.error);
    if (r4.error) console.error("[Landing] unique_stays error:", r4.error.message ?? r4.error);
    if (r5.error) console.error("[Landing] travel_styles error:", r5.error.message ?? r5.error);

    console.log(`[Landing] Fetched: flights=${flightDeals?.length ?? 0}, weekend=${weekendDeals?.length ?? 0}, destinations=${popularDestinations?.length ?? 0}, stays=${uniqueStays?.length ?? 0}, styles=${travelStyles?.length ?? 0}`);
    const mappedFlightDeals: Deal[] = flightDeals?.map(d => ({
        id: String(d.id),
        title: `${d.origin} → ${d.destination}`,
        subtitle: d.airline ? getAirlineName(d.airline) : "Best flexible fares",
        discount: d.discount_tag || "",
        originalPrice: Number(d.baseline_price || d.original_price || 0),
        salePrice: Number(d.price || 0),
        currency: d.currency || 'USD',
        image: d.image_url || (d.destination ? `/api/destination-photo?iata=${encodeURIComponent(d.destination)}` : '/api/destination-photo'),
        endsIn: d.ends_in || "Limited Time",
        origin: d.origin || undefined,
        destination: d.destination || undefined,
        departure_date: toYMD(d.departure_date),
        return_date: toYMD(d.return_date),
        cabinClass: d.cabin_class || 'economy',
        lastRefreshedAt: d.last_refreshed_at || undefined,
    })) ?? [];


    const mappedWeekendDeals = weekendDeals?.map(d => ({
        id: d.id,
        name: d.name,
        location: d.location,
        rating: Number(d.rating || 0),
        reviews: Number(d.reviews || 0),
        originalPrice: Number(d.original_price || 0),
        salePrice: Number(d.sale_price || 0),
        currency: d.currency || 'PHP',
        image: d.image_url || `/api/hotel-photo?q=${encodeURIComponent(`${d.name} ${d.location}`)}`,
        badge: d.badge,
        guests: Number(d.guests || 0),
        bedrooms: Number(d.bedrooms || 0),
        bathrooms: Number(d.bathrooms || 0),
    })) ?? [];

    const mappedDestinations: VacationPackage[] = popularDestinations?.map(d => ({
        id: d.id,
        name: d.city,
        location: d.country,
        image: d.image_url || (
            (d.destination_code || d.iata_code)
                ? `/api/destination-photo?iata=${encodeURIComponent(d.destination_code || d.iata_code)}`
                : `/api/hotel-photo?q=${encodeURIComponent(`${d.city} ${d.country} tourism`)}`
        ),
        originalPrice: Number(d.average_price || 0) * DESTINATION_PRICE_MARKUP,
        salePrice: Number(d.average_price || 0),
        includes: DESTINATION_INCLUDES_DEFAULT,
        rating: DESTINATION_RATING_DEFAULT,
        reviews: DESTINATION_REVIEWS_DEFAULT,
        destinationCode: d.destination_code || d.iata_code || undefined,
    })) ?? [];

    const mappedUniqueStays = uniqueStays?.map(d => ({
        id: d.id,
        name: d.name,
        location: d.location,
        rating: Number(d.rating || 0),
        price: Number(d.price || 0),
        image: d.image_url || `/api/hotel-photo?q=${encodeURIComponent(`${d.name} ${d.location}`)}`,
        badge: d.badge
    })) ?? [];

    const mappedTravelStyles = travelStyles?.map(d => ({
        id: d.id,
        title: d.title,
        location: d.location,
        price: Number(d.price || 0),
        image: d.image_url || `/api/hotel-photo?q=${encodeURIComponent(`${d.title} ${d.location} travel`)}`,
    })) ?? [];

    return {
        flightDeals: mappedFlightDeals,
        weekendDeals: mappedWeekendDeals,
        popularDestinations: mappedDestinations,
        uniqueStays: mappedUniqueStays,
        travelStyles: mappedTravelStyles
    };
});
