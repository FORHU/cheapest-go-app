/**
 * Room utilities for data transformation and business logic.
 * Pure functions that can be used in both server and client components.
 */

import { RateOption } from '@/components/property/RoomCard';

/**
 * Room type from LiteAPI
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
    cancellationPolicy?: {
        cancelPolicyInfos?: Array<{ cancelDeadline?: string }>;
    };
    refundableTag?: string;
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
 */
export function hasFreeCancellation(rates?: RoomRate[]): boolean {
    if (!rates || rates.length === 0) return false;

    // Check refundableTag first (LiteAPI standard)
    if (rates[0]?.refundableTag === 'RFN') return true;
    if (rates[0]?.refundableTag === 'NRFN') return false;

    // Fallback to checking cancellation policy
    const policy = rates[0]?.cancellationPolicy;
    return !!policy?.cancelPolicyInfos?.length;
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
 * Create a rate option from a room type
 */
export function createRateOption(roomType: RoomType): RateOption {
    const priceInfo = extractRoomPrice(roomType.rates);
    const refundable = hasFreeCancellation(roomType.rates);

    return {
        offerId: roomType.offerId || '',
        price: priceInfo.amount,
        currency: priceInfo.currency,
        boardType: roomType.rates?.[0]?.boardType,
        boardName: roomType.rates?.[0]?.boardName || 'Room only',
        refundable,
        cancellationDeadline: roomType.rates?.[0]?.cancellationPolicy?.cancelPolicyInfos?.[0]?.cancelDeadline
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
