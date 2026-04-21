/**
 * Server-side data fetching utilities for property page.
 * These are pure functions that can be used in server components.
 */

import { cache } from 'react';
import { preBook, getHotelDetails } from '@/utils/supabase/functions';
import { type Property } from '@/types';
export type PropertyData = Property;

// Types
export interface SearchParamsInput {
    checkIn?: string;
    checkOut?: string;
    adults?: string | number;
    children?: string | number;
    rooms?: string | number;
    offerId?: string;
    currency?: string;
}

export interface FetchPropertyResult {
    property: PropertyData | null;
    fetchedDetails: any;
    preBookResult: any;
}

// Format date as YYYY-MM-DD for API parameters (Local Date)
export function formatDateForApi(date: Date): string {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

// Sanitize date from URL (handles YYYY-MM-DD and ISO strings)
export function sanitizeDate(dateStr: string | undefined): string | undefined {
    if (!dateStr) return undefined;
    try {
        const decoded = decodeURIComponent(dateStr);
        // If it's already YYYY-MM-DD, return as is
        if (/^\d{4}-\d{2}-\d{2}$/.test(decoded)) {
            return decoded;
        }
        // If it's an ISO string or other format, parse and format as local YYYY-MM-DD
        // Note: For ISO strings like "2026-04-03T22:00:00Z", this might still be tricky
        // but since we updated the frontend to send YYYY-MM-DD, this is a fallback.
        const d = new Date(decoded);
        if (isNaN(d.getTime())) return undefined;
        return formatDateForApi(d);
    } catch {
        return undefined;
    }
}

// Get default check-in/out dates (tomorrow + 2 days)
export function getDefaultDates() {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const dayAfter = new Date(tomorrow);
    dayAfter.setDate(tomorrow.getDate() + 2);
    return { checkIn: formatDateForApi(tomorrow), checkOut: formatDateForApi(dayAfter) };
}

// Collect room images from room types
export function collectRoomImages(roomTypes: any[] | undefined): string[] {
    const images: string[] = [];
    if (roomTypes) {
        roomTypes.forEach((room: any) => {
            if (room.roomPhotos && Array.isArray(room.roomPhotos)) {
                images.push(...room.roomPhotos);
            }
        });
    }
    return images;
}

// Combine and deduplicate images
export function combineImages(
    thumbnailUrl: string | undefined,
    hotelImages: string[],
    roomImages: string[]
): string[] {
    return [
        ...(thumbnailUrl ? [thumbnailUrl] : []),
        ...hotelImages,
        ...roomImages
    ].filter((img, index, arr) => img && arr.indexOf(img) === index);
}

// Transform fetched details to PropertyData
export function transformFetchedToProperty(
    id: string,
    fetchedDetails: any,
    preBookResult: any,
    allImages: string[],
    currency: string
): PropertyData {
    return {
        id: fetchedDetails.hotelId || id,
        name: fetchedDetails.name || "Unknown Property",
        location: fetchedDetails.location || fetchedDetails.address || "Unknown Location",
        description: fetchedDetails.description || "No description available",
        rating: fetchedDetails.reviewRating || fetchedDetails.starRating || 0,
        reviews: fetchedDetails.reviewCount || 0,
        price: preBookResult?.price?.amount || fetchedDetails.rates?.[0]?.price?.amount || 0,
        currency,
        originalPrice: undefined,
        image: allImages[0] || '',
        images: allImages.length > 0 ? allImages : [],
        amenities: fetchedDetails.hotelFacilities || fetchedDetails.details?.amenities || [],
        badges: [],
        type: 'hotel',
        coordinates: {
            lat: fetchedDetails.latitude || fetchedDetails.details?.latitude || fetchedDetails.details?.location?.latitude || 0,
            lng: fetchedDetails.longitude || fetchedDetails.details?.longitude || fetchedDetails.details?.location?.longitude || 0
        }
    };
}

// Create fallback property from prebook result
export function createFallbackProperty(id: string, preBookResult: any, currency: string): PropertyData {
    return {
        id,
        name: preBookResult?.data?.name || "Property Details Unavailable",
        location: preBookResult?.data?.address || "Unknown Location",
        description: "Property details could not be fetched.",
        rating: 0,
        reviews: 0,
        price: preBookResult?.price?.amount || 0,
        currency,
        image: '',
        images: [],
        amenities: [],
        badges: [],
        type: 'hotel',
        coordinates: { lat: 0, lng: 0 }
    };
}

/**
 * Main data fetching function for property page.
 * Handles prebook, hotel details, and fallbacks.
 * Wrapped in React.cache to avoid redundant hits in generateMetadata + Page component.
 */
export const fetchPropertyData = cache(async (
    id: string,
    searchParams: SearchParamsInput
): Promise<FetchPropertyResult> => {
    let preBookResult = null;
    let fetchedDetails = null;

    // 1. Invoke pre-book if offerId is present
    if (searchParams.offerId) {
        try {
            preBookResult = await preBook({ 
                offerId: searchParams.offerId as string,
                currency: searchParams.currency || 'KRW'
            });
        } catch (error) {
            console.error('Pre-book check failed:', error);
        }
    }

        // 2. Fetch hotel details (Strictly backend)
    try {
        const targetHotelId = preBookResult?.data?.hotelId || id;
        const defaults = getDefaultDates();
        let checkIn = sanitizeDate(searchParams.checkIn as string) || defaults.checkIn;
        let checkOut = sanitizeDate(searchParams.checkOut as string) || defaults.checkOut;

        // Strictly enforce "At least tomorrow" for check-in
        if (checkIn <= formatDateForApi(new Date())) {
            checkIn = defaults.checkIn;
            // Also ensure checkOut is after the new checkIn
            if (checkOut <= checkIn) {
                checkOut = defaults.checkOut;
            }
        }

        fetchedDetails = await getHotelDetails(targetHotelId, {
            checkIn,
            checkOut,
            adults: Number(searchParams.adults || 2),
            children: Number(searchParams.children || 0),
            rooms: Number(searchParams.rooms || 1),
            currency: searchParams.currency
        });
    } catch (error) {
        console.error('Failed to fetch property details:', error);
    }

    // Fallback: If no details found for requested currency, try USD for static content
    if (!fetchedDetails && searchParams.currency && searchParams.currency !== 'USD') {
        try {
            const targetHotelId = preBookResult?.data?.hotelId || id;
            const defaults = getDefaultDates();
            const checkIn = sanitizeDate(searchParams.checkIn as string) || defaults.checkIn;
            const checkOut = sanitizeDate(searchParams.checkOut as string) || defaults.checkOut;

            const fallbackDetails = await getHotelDetails(targetHotelId, {
                checkIn,
                checkOut,
                adults: Number(searchParams.adults || 2),
                children: Number(searchParams.children || 0),
                rooms: Number(searchParams.rooms || 1),
                currency: 'USD'
            });

            if (fallbackDetails) {
                fetchedDetails = {
                    ...fallbackDetails,
                    roomTypes: [], // Clear rooms to avoid showing USD prices as the requested currency
                    isFallback: true
                };
            }
        } catch (err) {
            console.error('Fallback fetch failed:', err);
        }
    }

    // 3. Build property data
    let property: PropertyData | null = null;

    if (fetchedDetails) {
        const roomImages = collectRoomImages(fetchedDetails.roomTypes);
        const allImages = combineImages(
            fetchedDetails.thumbnailUrl,
            fetchedDetails.images || [],
            roomImages
        );
        property = transformFetchedToProperty(id, fetchedDetails, preBookResult, allImages, searchParams.currency || 'KRW');
    } else if (preBookResult || searchParams.offerId) {
        property = createFallbackProperty(id, preBookResult, searchParams.currency || 'KRW');
    }

    return { property, fetchedDetails, preBookResult };
});
