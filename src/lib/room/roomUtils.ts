/**
 * Room utilities for data transformation and business logic.
 * Pure functions that can be used in both server and client components.
 */

import { RateOption } from '@/components/property/RoomCard';

/**
 * Room type from LiteAPI (each roomType is actually an "offer")
 * An offer = physical room + meal plan + cancellation policy
 */
export interface RoomType {
    offerId?: string;
    name?: string;
    roomName?: string;
    maxOccupancy?: number;
    bedType?: string;
    roomSize?: string;
    roomPhotos?: string[];
    roomDescription?: string;
    rates?: RoomRate[];
    amenities?: (string | { name: string })[];
    /**
     * Cancellation policies at offer/roomType level (LiteAPI docs structure)
     * Each "offer" has ONE cancellation policy that applies to all rates within it
     */
    cancellationPolicies?: {
        refundableTag?: 'RFN' | 'NRFN' | string;
        cancelPolicyInfos?: Array<{
            cancelTime?: string;
            cancelDeadline?: string;
            amount?: number;
            currency?: string;
            type?: string;
        }>;
        hotelRemarks?: string[];
    };
}

export interface RoomRate {
    rateId?: string;
    name?: string;
    boardType?: string;
    boardName?: string;
    maxOccupancy?: number;
    retailRate?: {
        total?: Array<{ amount: number; currency: string }> | { amount: number };
    };
    /** LiteAPI structure: refundableTag is INSIDE cancellationPolicies */
    cancellationPolicies?: {
        refundableTag?: 'RFN' | 'NRFN' | string;
        cancelPolicyInfos?: Array<{
            cancelTime?: string;
            cancelDeadline?: string;
            amount?: number;
            currency?: string;
            type?: string;
        }>;
        hotelRemarks?: string[];
    };
    /** @deprecated Use cancellationPolicies.refundableTag instead */
    refundableTag?: string;
    /** @deprecated Use cancellationPolicies instead */
    cancellationPolicy?: {
        cancelPolicyInfos?: Array<{ cancelDeadline?: string; amount?: number }>;
    };
}

/**
 * Grouped room with multiple rate options
 */
export interface GroupedRoom {
    roomName: string;
    roomTypes: RoomType[];
    rateOptions: RateOption[];
    lowestPrice: number;
    currency: string;
    maxOccupancy?: number;
    bedType?: string;
    roomSize?: string;
    roomPhotos?: string[];
    roomDescription?: string;
    amenities?: (string | { name: string })[];
}

/**
 * Price extraction result
 */
export interface PriceInfo {
    amount: number;
    currency: string;
}

/**
 * Extract price from API rate structure
 */
export function extractRoomPrice(rates?: RoomRate[]): PriceInfo {
    if (!rates || rates.length === 0) {
        return { amount: 0, currency: 'PHP' };
    }

    const total = rates[0]?.retailRate?.total;

    if (Array.isArray(total) && total.length > 0) {
        return {
            amount: total[0].amount || 0,
            currency: total[0].currency || 'PHP'
        };
    }

    if (typeof total === 'object' && total !== null && 'amount' in total) {
        return {
            amount: (total as { amount: number }).amount || 0,
            currency: 'PHP'
        };
    }

    return { amount: 0, currency: 'PHP' };
}

/**
 * Check if free cancellation is available based on refundableTag or cancellation policy
 *
 * LiteAPI structure (per docs):
 * - cancellationPolicies is at roomType/offer level, NOT individual rate level
 * - Each roomType has ONE cancellation policy that applies to all its rates
 *
 * @param roomType - The roomType/offer object (preferred)
 * @param rates - Fallback: array of rates (for backwards compatibility)
 */
export function hasFreeCancellation(roomType?: RoomType | null, rates?: RoomRate[]): boolean {
    // 1. Check roomType-level cancellationPolicies (correct per LiteAPI docs)
    if (roomType?.cancellationPolicies?.refundableTag) {
        return roomType.cancellationPolicies.refundableTag === 'RFN';
    }

    // 2. Fallback: Check rate-level cancellationPolicies (some API responses include this)
    const rate = rates?.[0] || roomType?.rates?.[0];
    if (rate?.cancellationPolicies?.refundableTag) {
        return rate.cancellationPolicies.refundableTag === 'RFN';
    }

    // 3. Fallback: Check legacy refundableTag directly on rate
    if (rate?.refundableTag === 'RFN') return true;
    if (rate?.refundableTag === 'NRFN') return false;

    // 4. Last fallback: Check cancelPolicyInfos for 0% fee
    const cancelPolicies = roomType?.cancellationPolicies?.cancelPolicyInfos ||
                          rate?.cancellationPolicies?.cancelPolicyInfos ||
                          rate?.cancellationPolicy?.cancelPolicyInfos;
    if (cancelPolicies && cancelPolicies.length > 0) {
        const firstPolicy = cancelPolicies[0];
        if (firstPolicy.amount === 0) return true;
    }

    return false;
}

/**
 * Normalize room name by removing rate-specific suffixes
 */
export function normalizeRoomName(roomName: string): string {
    return roomName
        .replace(/\s*-\s*(non[- ]?refundable|refundable|room only|breakfast included).*$/i, '')
        .trim();
}

/**
 * Get the display name for a room type
 */
export function getRoomDisplayName(roomType: RoomType): string {
    return roomType.rates?.[0]?.name || roomType.name || roomType.roomName || 'Standard Room';
}

/**
 * Create a rate option from a room type (offer)
 * Each roomType in LiteAPI is an "offer" = room + meal plan + cancellation policy
 */
export function createRateOption(roomType: RoomType): RateOption {
    const priceInfo = extractRoomPrice(roomType.rates);
    // Pass roomType to check cancellationPolicies at the correct level (per LiteAPI docs)
    const refundable = hasFreeCancellation(roomType, roomType.rates);
    const rate = roomType.rates?.[0];

    // Get cancellation deadline - check roomType level first, then rate level
    const cancelDeadline = roomType.cancellationPolicies?.cancelPolicyInfos?.[0]?.cancelTime ||
                          roomType.cancellationPolicies?.cancelPolicyInfos?.[0]?.cancelDeadline ||
                          rate?.cancellationPolicies?.cancelPolicyInfos?.[0]?.cancelTime ||
                          rate?.cancellationPolicies?.cancelPolicyInfos?.[0]?.cancelDeadline ||
                          rate?.cancellationPolicy?.cancelPolicyInfos?.[0]?.cancelDeadline;

    return {
        offerId: roomType.offerId || '',
        price: priceInfo.amount,
        currency: priceInfo.currency,
        boardType: rate?.boardType,
        boardName: rate?.boardName || 'Room only',
        refundable,
        cancellationDeadline: cancelDeadline
    };
}

/**
 * Group room types by their physical room name
 * Rates become different pricing options within each group
 */
export function groupRoomsByName(roomTypes: RoomType[]): GroupedRoom[] {
    if (!roomTypes || roomTypes.length === 0) return [];

    const groups = new Map<string, GroupedRoom>();

    roomTypes.forEach((roomType) => {
        const roomName = getRoomDisplayName(roomType);
        const normalizedName = normalizeRoomName(roomName);

        const priceInfo = extractRoomPrice(roomType.rates);
        const rateOption = createRateOption(roomType);

        if (groups.has(normalizedName)) {
            const existing = groups.get(normalizedName)!;
            existing.rateOptions.push(rateOption);
            existing.roomTypes.push(roomType);

            // Update lowest price
            if (priceInfo.amount < existing.lowestPrice) {
                existing.lowestPrice = priceInfo.amount;
            }

            // Merge photos if new ones found
            if (roomType.roomPhotos?.length && !existing.roomPhotos?.length) {
                existing.roomPhotos = roomType.roomPhotos;
            }
        } else {
            groups.set(normalizedName, {
                roomName: normalizedName,
                roomTypes: [roomType],
                rateOptions: [rateOption],
                lowestPrice: priceInfo.amount,
                currency: priceInfo.currency,
                maxOccupancy: roomType.maxOccupancy || roomType.rates?.[0]?.maxOccupancy,
                bedType: roomType.bedType,
                roomSize: roomType.roomSize,
                roomPhotos: roomType.roomPhotos,
                roomDescription: roomType.roomDescription,
                amenities: roomType.amenities
            });
        }
    });

    // Sort rate options by price within each group
    groups.forEach((group) => {
        group.rateOptions.sort((a, b) => a.price - b.price);
    });

    return Array.from(groups.values());
}

/**
 * Find a rate option by offer ID within grouped rooms
 */
export function findRateByOfferId(
    groupedRoom: GroupedRoom,
    offerId: string | undefined
): RateOption | undefined {
    if (!offerId) return groupedRoom.rateOptions[0];
    return groupedRoom.rateOptions.find(r => r.offerId === offerId) || groupedRoom.rateOptions[0];
}

/**
 * Get the room image with fallback to hotel images
 */
export function getRoomImage(
    groupedRoom: GroupedRoom,
    index: number,
    hotelImages: string[] = []
): string | undefined {
    return groupedRoom.roomPhotos?.[0] || hotelImages[index % Math.max(hotelImages.length, 1)];
}
