import { createClient } from "@/utils/supabase/server";
import { cache } from "react";
import { type Deal, type VacationPackage } from "@/types";

export const getLandingData = cache(async () => {
    const supabase = await createClient();

    const [
        { data: flightDeals, error: e1 },
        { data: weekendDeals, error: e2 },
        { data: popularDestinations, error: e3 },
        { data: uniqueStays, error: e4 },
        { data: travelStyles, error: e5 },
    ] = await Promise.all([
        supabase.from("flight_deals").select("*").limit(10),
        supabase.from("weekend_flight_deals").select("*").limit(10),
        supabase.from("popular_destinations").select("*").limit(12),
        supabase.from("unique_stays").select("*").limit(10),
        supabase.from("travel_styles").select("*").limit(10),
    ]);

    if (e1) console.error("[Landing] flight_deals error:", e1.message);
    if (e2) console.error("[Landing] weekend_flight_deals error:", e2.message);
    if (e3) console.error("[Landing] popular_destinations error:", e3.message);
    if (e4) console.error("[Landing] unique_stays error:", e4.message);
    if (e5) console.error("[Landing] travel_styles error:", e5.message);

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
