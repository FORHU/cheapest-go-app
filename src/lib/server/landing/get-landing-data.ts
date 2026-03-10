import { createClient } from "@/utils/supabase/server";
import { type Deal, type VacationPackage, type RecentSearch } from "@/data";

export async function getLandingData() {
    const supabase = await createClient();

    // Fetch Flight Deals
    const { data: flightDeals } = await supabase
        .from("flight_deals")
        .select("*")
        .limit(8);

    // Fetch Trending Routes (mapped to RecentSearch for now or handled separately)
    const { data: trendingRoutes } = await supabase
        .from("flight_trending_routes")
        .select("*")
        .limit(6);

    // Map DB deals to the 'Deal' interface expected by the UI
    const mappedDeals: Deal[] = flightDeals?.map(d => ({
        id: String(d.id),
        title: d.title,
        subtitle: d.subtitle || "",
        discount: d.discount || "",
        originalPrice: Number(d.original_price),
        salePrice: Number(d.sale_price),
        image: d.image || "https://picsum.photos/seed/travel/400/300",
        endsIn: d.ends_in || "Limited Time",
        tag: d.tag || undefined
    })) || [];

    // Map Trending Routes to 'RecentSearch' interface
    const mappedRecentSearches: RecentSearch[] = trendingRoutes?.map(r => ({
        id: r.id,
        destination: `${r.origin} → ${r.destination}`,
        dates: "Best flexible fares",
        travelers: "Round trip",
        rooms: r.price ? `From $${r.price}` : "Check fares"
    })) || [];

    return {
        cheapFlights: mappedDeals,
        trendingRoutes: mappedRecentSearches
    };
}
