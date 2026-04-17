'use client';

import { useQuery } from '@tanstack/react-query';

interface PlaceDetails {
    name?: string;
    rating?: number;
    photos?: { photo_reference: string; height: number; width: number }[];
    formatted_address?: string;
    geometry?: {
        location: { lat: number; lng: number }
    };
    opening_hours?: {
        open_now?: boolean;
        weekday_text?: string[];
    };
    price_level?: number;
}

/**
 * Custom hook to fetch optimized place details, cached by React Query on the client
 * and by Supabase on the server.
 */
export function usePlaceDetails(placeId: string | null | undefined) {
    return useQuery<PlaceDetails, Error>({
        queryKey: ['placeDetails', placeId],
        queryFn: async () => {
            if (!placeId) throw new Error("Place ID is required");
            const res = await fetch(`/api/place-details?place_id=${encodeURIComponent(placeId)}`);
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Failed to fetch place details');
            }
            return res.json();
        },
        enabled: Boolean(placeId), // Deduplicates and prevents fetching if no placeId
        staleTime: 1000 * 60 * 60, // Consider client-side cache fresh for 1 hour
    });
}
