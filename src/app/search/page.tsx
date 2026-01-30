import { Suspense } from 'react';
import { Header, Footer } from '@/components/landing';
import SearchFilters from '@/components/search/SearchFilters';
import SearchResults from '@/components/search/SearchResults';
import { SearchModule } from '@/components/landing/hero/SearchModule';
import BackButton from '@/components/common/BackButton';

export const metadata = {
    title: 'Search Results - AeroVantage',
    description: 'Find your perfect stay.',
};

import { Property } from '@/data/mockProperties';
import { searchLiteApi } from '@/utils/supabase/functions';

export default async function SearchPage(props: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const searchParams = await props.searchParams;

    // Helper to format date as YYYY-MM-DD
    const formatDate = (dateInput: string | undefined): string => {
        if (!dateInput) return "";
        try {
            const d = new Date(dateInput);
            if (isNaN(d.getTime())) return "";
            return d.toISOString().split('T')[0];
        } catch {
            return "";
        }
    };

    const rawCheckin = (typeof searchParams.checkIn === 'string' && searchParams.checkIn ? searchParams.checkIn :
        typeof searchParams.checkin === 'string' && searchParams.checkin ? searchParams.checkin : "2026-06-01");
    const rawCheckout = (typeof searchParams.checkOut === 'string' && searchParams.checkOut ? searchParams.checkOut :
        typeof searchParams.checkout === 'string' && searchParams.checkout ? searchParams.checkout : "2026-06-05");

    const queryDestination = typeof searchParams.destination === 'string' ? searchParams.destination : "";
    // Don't strip " City" anymore to allow "Quezon City" etc.
    const rawDestination = queryDestination;

    // Parse filter parameters from URL
    const hotelName = typeof searchParams.hotelName === 'string' ? searchParams.hotelName : undefined;
    const starRating = typeof searchParams.starRating === 'string'
        ? searchParams.starRating.split(',').map(Number).filter(n => !isNaN(n) && n >= 1 && n <= 5)
        : undefined;
    const minRating = typeof searchParams.minRating === 'string' ? Number(searchParams.minRating) : undefined;
    const minReviewsCount = typeof searchParams.minReviewsCount === 'string' ? Number(searchParams.minReviewsCount) : undefined;
    const facilities = typeof searchParams.facilities === 'string'
        ? searchParams.facilities.split(',').map(Number).filter(n => !isNaN(n))
        : undefined;
    const strictFacilityFiltering = searchParams.strictFacilityFiltering === 'true';

    const queryParams: Record<string, any> = {
        checkin: formatDate(rawCheckin) || "2026-06-01",
        checkout: formatDate(rawCheckout) || "2026-06-05",
        adults: Number(searchParams.adults) || 2,
        children: Number(searchParams.children) || 0,
        rooms: Number(searchParams.rooms) || 1,
        guest_nationality: typeof searchParams.nationality === 'string' && searchParams.nationality ? searchParams.nationality : "KR",
        currency: "PHP",
        cityName: rawDestination,
        countryCode: typeof searchParams.countryCode === 'string' ? searchParams.countryCode : "PH",
        placeId: typeof searchParams.placeId === 'string' ? searchParams.placeId : undefined,
        query: rawDestination,
    };

    // Add filter parameters if present
    if (hotelName) queryParams.hotelName = hotelName;
    if (starRating && starRating.length > 0) queryParams.starRating = starRating;
    if (minRating && minRating > 0) queryParams.minRating = minRating;
    if (minReviewsCount && minReviewsCount > 0) queryParams.minReviewsCount = minReviewsCount;
    if (facilities && facilities.length > 0) {
        queryParams.facilities = facilities;
        if (strictFacilityFiltering) queryParams.strictFacilityFiltering = true;
    }

    let initialProperties: Property[] = [];

    try {
        console.log("[SearchPage] Calling searchLiteApi with params:", queryParams);
        const data = await searchLiteApi(queryParams);

        if (data && data.data && Array.isArray(data.data)) {

            // Map API response to Property interface
            initialProperties = data.data.map((hotel: any) => {
                // Try to find a price from roomTypes
                let price = 0;
                let originalPrice = undefined;

                if (hotel.roomTypes && hotel.roomTypes.length > 0) {
                    const firstRoom = hotel.roomTypes[0];
                    if (firstRoom.rates && firstRoom.rates.length > 0) {
                        // Use retailRate.total for price
                        const total = firstRoom.rates[0]?.retailRate?.total;

                        if (Array.isArray(total) && total.length > 0 && typeof total[0] === 'object' && 'amount' in total[0]) {
                            price = (total[0] as any).amount || 0;
                        } else if (typeof total === 'object' && total !== null && 'amount' in total) {
                            // Fallback for object
                            price = (total as any).amount || 0;
                        } else if (typeof total === 'number') {
                            price = total;
                        } else {
                            price = 0;
                        }
                    }
                }

                return {
                    id: hotel.hotelId,
                    // Use enriched details if available, otherwise fallback
                    name: hotel.name || `Hotel ${hotel.hotelId}`,
                    location: hotel.location || queryParams.cityName,
                    description: hotel.description || hotel.details?.description || "No description available",
                    rating: hotel.reviewRating || hotel.starRating || 0,
                    reviews: hotel.reviewCount || hotel.details?.review_count || 0,
                    price: price,
                    originalPrice: originalPrice,
                    image: hotel.thumbnailUrl || 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&q=80&w=800',
                    images: hotel.details?.hotel_images_photos ? hotel.details.hotel_images_photos.map((p: any) => p.url) : [],
                    amenities: hotel.details?.facilities || [],
                    badges: [], // Could map 'is_recommended' or similar if API has it
                    type: 'hotel',
                    coordinates: {
                        lat: hotel.details?.location?.latitude || 0,
                        lng: hotel.details?.location?.longitude || 0
                    }
                } as Property;
            });
        }
    } catch (e) {
        console.error("Failed to fetch properties:", e);
        // We could handle error state here, e.g. pass an error prop to SearchResults or show a toast
    }

    return (
        <>
            <Header />

            <main className="min-h-screen pt-6 pb-20 px-4 md:px-6">
                <div className="max-w-7xl mx-auto">
                    {/* Back to Home */}
                    <div className="mb-4">
                        <BackButton label="Back to Home" href="/" />
                    </div>

                    {/* Compact Search Bar for Results Page */}
                    <div className="mb-8 relative z-50">
                        {/* Note: We reuse the SearchModule but might want a more compact version in the future. 
                     For now, we can wrap it or style it to fit. To keep it expeda-like, it's usually at the top. */}
                        <div className="origin-top transform scale-90 sm:scale-100">
                            <SearchModule />
                        </div>
                    </div>
                </div>

                <div className="max-w-7xl mx-auto flex flex-col lg:flex-row gap-8">
                    <Suspense fallback={
                        <div className="w-full flex-shrink-0 lg:w-[280px] space-y-4">
                            <div className="h-32 bg-slate-200 dark:bg-slate-700 rounded-xl animate-pulse" />
                            <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-1/2 animate-pulse" />
                            <div className="space-y-3">
                                {[1, 2, 3, 4, 5].map(i => (
                                    <div key={i} className="h-10 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                                ))}
                            </div>
                        </div>
                    }>
                        <SearchFilters />
                    </Suspense>
                    <SearchResults initialProperties={initialProperties} />
                </div>
            </main>

            <Footer />
        </>
    );
}
