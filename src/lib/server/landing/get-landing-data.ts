import { createClient } from "@/utils/supabase/server";
import { cache } from "react";
import { type Deal, type VacationPackage } from "@/types";

const EMPTY_RESULT = {
    flightDeals: [] as Deal[],
    weekendDeals: [] as any[],
    popularDestinations: [] as VacationPackage[],
    uniqueStays: [] as any[],
    travelStyles: [] as any[],
};

export const getLandingData = cache(async () => {
    let supabase: Awaited<ReturnType<typeof createClient>>;
    try {
        supabase = await createClient();
    } catch (err) {
        console.error("[Landing] Failed to create Supabase client:", err);
        return EMPTY_RESULT;
    }

    // Helper: query with one retry on network errors (TypeError: fetch failed)
    async function query(table: string, limit: number): Promise<{ data: any[] | null; error: any }> {
        try {
            const result = await supabase.from(table).select("*").limit(limit);
            if (result.error?.message?.includes("fetch failed")) {
                await new Promise(r => setTimeout(r, 100));
                return supabase.from(table).select("*").limit(limit);
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
        subtitle: d.airline || "Best flexible fares",
        discount: d.discount_tag || "",
        originalPrice: Number(d.baseline_price || d.original_price || 0),
        salePrice: Number(d.price || 0),
        image: d.image_url || "https://picsum.photos/seed/travel/400/300",
        endsIn: d.ends_in || "Limited Time",
        origin: d.origin || undefined,
        destination: d.destination || undefined,
        departure_date: d.departure_date || undefined,
        return_date: d.return_date || undefined,
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
        image: d.image_url || "https://picsum.photos/seed/stay/400/300",
        badge: d.badge
    })) ?? [];

    const mappedDestinations: VacationPackage[] = popularDestinations?.map(d => ({
        id: d.id,
        name: d.city,
        location: d.country,
        image: d.image_url || "https://picsum.photos/seed/dest/400/300",
        originalPrice: Number(d.average_price || 0) * 1.2,
        salePrice: Number(d.average_price || 0),
        includes: ["Flight + Hotel", "Free Baggage"],
        rating: 4.8,
        reviews: 1240,
        destinationCode: d.destination_code || d.iata_code || undefined,
    })) ?? [];

    const mappedUniqueStays = uniqueStays?.map(d => ({
        id: d.id,
        name: d.name,
        location: d.location,
        rating: Number(d.rating || 0),
        price: Number(d.price || 0),
        image: d.image_url || "https://picsum.photos/seed/unique/400/300",
        badge: d.badge
    })) ?? [];

    const mappedTravelStyles = travelStyles?.map(d => ({
        id: d.id,
        title: d.title,
        location: d.location,
        price: Number(d.price || 0),
        image: d.image_url || "https://picsum.photos/seed/style/400/300"
    })) ?? [];

    return {
        flightDeals: mappedFlightDeals,
        weekendDeals: mappedWeekendDeals,
        popularDestinations: mappedDestinations,
        uniqueStays: mappedUniqueStays,
        travelStyles: mappedTravelStyles
    };
});
