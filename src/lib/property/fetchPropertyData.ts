/**
 * Server-side data fetching utilities for property page.
 * These are pure functions that can be used in server components.
 */

import { baguioProperties } from '@/data/mockProperties';
import { preBook, getHotelDetails } from '@/utils/supabase/functions';

// Types
export interface PropertyData {
    id: string;
    name: string;
    location: string;
    description: string;
    rating: number;
    reviews: number;
    price: number;
    originalPrice?: number;
    image: string;
    images: string[];
    amenities: string[];
    badges: string[];
    type: 'hotel' | 'apartment' | 'resort' | 'villa';
    coordinates: { lat: number; lng: number };
}

export interface SearchParamsInput {
    checkIn?: string;
    checkOut?: string;
    adults?: string | number;
    children?: string | number;
    rooms?: string | number;
    offerId?: string;
}

export interface FetchPropertyResult {
    property: PropertyData | null;
    fetchedDetails: any;
    preBookResult: any;
}

// Helper to get mock property
export function getMockProperty(id: string) {
    return baguioProperties.find(p => p.id === id);
}

// Format date as YYYY-MM-DD
export function formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
}

// Sanitize date from URL (may be ISO strings)
export function sanitizeDate(dateStr: string | undefined): string | undefined {
    if (!dateStr) return undefined;
    try {
        return new Date(decodeURIComponent(dateStr)).toISOString().split('T')[0];
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
    return { checkIn: formatDate(tomorrow), checkOut: formatDate(dayAfter) };
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
    allImages: string[]
): PropertyData {
    return {
        id: fetchedDetails.hotelId || id,
        name: fetchedDetails.name || "Unknown Property",
        location: fetchedDetails.location || fetchedDetails.address || "Unknown Location",
        description: fetchedDetails.description || "No description available",
        rating: fetchedDetails.reviewRating || fetchedDetails.starRating || 0,
        reviews: fetchedDetails.reviewCount || 0,
        price: preBookResult?.price?.amount || fetchedDetails.rates?.[0]?.price?.amount || 0,
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
export function createFallbackProperty(id: string, preBookResult: any): PropertyData {
    return {
        id,
        name: preBookResult?.data?.name || "Property Details Unavailable",
        location: preBookResult?.data?.address || "Unknown Location",
        description: "Property details could not be fetched.",
        rating: 0,
        reviews: 0,
        price: preBookResult?.price?.amount || 0,
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
 */
export async function fetchPropertyData(
    id: string,
    searchParams: SearchParamsInput
): Promise<FetchPropertyResult> {
    let preBookResult = null;
    let fetchedDetails = null;

    // 1. Invoke pre-book if offerId is present
    if (searchParams.offerId) {
        try {
            preBookResult = await preBook({ offerId: searchParams.offerId as string });
        } catch (error) {
            console.error('Pre-book check failed:', error);
        }
    }

    // 2. Fetch hotel details if not a mock property
    if (!getMockProperty(id)) {
        try {
            const targetHotelId = preBookResult?.data?.hotelId || id;
            const defaults = getDefaultDates();
            const checkIn = sanitizeDate(searchParams.checkIn as string) || defaults.checkIn;
            const checkOut = sanitizeDate(searchParams.checkOut as string) || defaults.checkOut;

            fetchedDetails = await getHotelDetails(targetHotelId, {
                checkIn,
                checkOut,
                adults: Number(searchParams.adults || 2),
                children: Number(searchParams.children || 0),
                rooms: Number(searchParams.rooms || 1)
            });
        } catch (error) {
            console.error('Failed to fetch property details:', error);
        }
    }

    // 3. Build property data
    let property = getMockProperty(id) as PropertyData | null;

    if (!property && fetchedDetails) {
        const roomImages = collectRoomImages(fetchedDetails.roomTypes);
        const allImages = combineImages(
            fetchedDetails.thumbnailUrl,
            fetchedDetails.images || [],
            roomImages
        );
        property = transformFetchedToProperty(id, fetchedDetails, preBookResult, allImages);
    } else if (!property && (preBookResult || searchParams.offerId)) {
        property = createFallbackProperty(id, preBookResult);
    }

    return { property, fetchedDetails, preBookResult };
}
