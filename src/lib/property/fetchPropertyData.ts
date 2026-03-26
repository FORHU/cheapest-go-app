/**
 * Server-side data fetching utilities for property page.
 * These are pure functions that can be used in server components.
 */

import { type Property } from '@/types';
import {
    ondaGetProperty,
    ondaSearchPropertyDetail,
    mapOndaPropertyToProperty,
    mapOndaRoomTypesToRoomTypes,
} from '@/lib/server/onda';
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

// Format date as YYYY-MM-DD for API parameters
export function formatDateForApi(date: Date): string {
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
 * Fetches property details and available room types from ONDA.
 */
export async function fetchPropertyData(
    id: string,
    searchParams: SearchParamsInput
): Promise<FetchPropertyResult> {
    const checkin = sanitizeDate(searchParams.checkIn) ?? getDefaultDates().checkIn;
    const checkout = sanitizeDate(searchParams.checkOut) ?? getDefaultDates().checkOut;
    const adult = Number(searchParams.adults) || 2;

    try {
        // Fetch property details + available room types in parallel
        const [propResult, availResult] = await Promise.allSettled([
            ondaGetProperty(id),
            ondaSearchPropertyDetail(id, { checkin, checkout, adult }),
        ]);

        if (propResult.status === 'rejected') {
            console.error('[fetchPropertyData] Failed to fetch ONDA property:', propResult.reason);
            return { property: null, fetchedDetails: null, preBookResult: null };
        }

        const ondaProp = propResult.value;
        const ondaRoomTypes = availResult.status === 'fulfilled' ? availResult.value : [];

        // Lowest available price (for display)
        const lowestPrice = ondaRoomTypes.reduce((min, rt) => {
            const rtMin = rt.rateplans.reduce((m, rp) => Math.min(m, rp.total?.sale_price ?? 0), Infinity);
            return Math.min(min, rtMin);
        }, Infinity);

        const property = mapOndaPropertyToProperty(ondaProp, isFinite(lowestPrice) ? lowestPrice : 0);

        const addr = ondaProp.address ?? {} as any;
        const roomTypes = mapOndaRoomTypesToRoomTypes(id, ondaRoomTypes, checkin, checkout);

        const fetchedDetails = {
            ...ondaProp,
            roomTypes,
            // Fields used by property page components
            address: [addr.address1, addr.address2, addr.address_detail].filter(Boolean).join(' ') || addr.address1 || '',
            city: addr.city,
            country: addr.country_code,
            checkInTime: ondaProp.checkin,
            checkOutTime: ondaProp.checkout,
            hotelImportantInformation: ondaProp.descriptions?.reservation || ondaProp.descriptions?.notice,
            hotelFacilities: ondaProp.tags?.facilities ?? [],
            cancellationPolicies: ondaProp.descriptions?.refunds
                ? [{ description: ondaProp.descriptions.refunds }]
                : undefined,
        };

        return { property, fetchedDetails, preBookResult: null };
    } catch (err) {
        console.error('[fetchPropertyData] ONDA error:', err instanceof Error ? err.message : err);
        return { property: null, fetchedDetails: null, preBookResult: null };
    }
}
