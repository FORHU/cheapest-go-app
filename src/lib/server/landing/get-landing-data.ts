import { createClient } from "@/utils/supabase/server";
import { cache } from "react";
import { type Deal, type VacationPackage } from "@/types";

export const getLandingData = cache(async () => {
    const supabase = await createClient();

    // 1. Fetch Flight Deals
    const { data: flightDeals } = await supabase
        .from("flight_deals")
        .select("*")
        .limit(6);

    // 2. Fetch Weekend Deals
    const { data: weekendDeals } = await supabase
        .from("weekend_flight_deals")
        .select("*")
        .limit(6);

    // 3. Fetch Popular Destinations
    const { data: popularDestinations } = await supabase
        .from("popular_destinations")
        .select("*")
        .limit(8);

    // 4. Fetch Unique Stays
    const { data: uniqueStays } = await supabase
        .from("unique_stays")
        .select("*")
        .limit(6);

    // 5. Fetch Travel Styles
    const { data: travelStyles } = await supabase
        .from("travel_styles")
        .select("*")
        .limit(4);

    // Mapping with defensive fallbacks
    const mappedFlightDeals: Deal[] = flightDeals?.map(d => ({
        id: String(d.id),
        title: `${d.origin} → ${d.destination}`,
        subtitle: d.airline || "Best flexible fares",
        discount: d.discount_tag || "",
        originalPrice: Number(d.baseline_price || d.original_price || 0),
        salePrice: Number(d.price || 0),
        image: d.image_url || "https://picsum.photos/seed/travel/400/300",
        endsIn: d.ends_in || "Limited Time",
        // Search routing fields
        origin: d.origin || undefined,
        destination: d.destination || undefined,
        departure_date: d.departure_date || undefined,
        return_date: d.return_date || undefined,
        // Live price metadata
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
