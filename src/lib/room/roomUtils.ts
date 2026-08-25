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
    /** Occupancy label derived from room name when maxOccupancy isn't provided (e.g. "Double · Sleeps 2") */
    roomOccupancy?: string;
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
 * A stripped name this short is a supplier code, not a room type. "U" and "S" have
 * both been seen on a live room card; a guest cannot book from that, so the name it
 * came from is kept instead. Three characters keeps real names that are genuinely
 * short — "Loft", "Twin" — while rejecting bare codes.
 */
const MIN_MEANINGFUL_ROOM_NAME = 3;

/**
 * Normalize room name by removing rate-specific suffixes and TGX parenthetical qualifiers.
 * TGX names follow "Base type (qualifier1, qualifier2)" — everything in parens is a variant,
 * not a room identity. Stripping them lets same-type rooms collapse into one card.
 *
 * Stripping is skipped when it would leave nothing to read. A supplier that files a
 * room as "U (Superior Double room)" has put the identity inside the parentheses, and
 * removing them leaves a card titled "U". Better a long name than an unbookable one.
 */
export function normalizeRoomName(roomName: string): string {
    const withoutRateSuffix = roomName
        .replace(/\s*-\s*(non[- ]?refundable|refundable|room only|breakfast included).*$/i, '')
        .trim();

    const withoutQualifiers = withoutRateSuffix
        .replace(/\s*\(.*$/, '')   // strip everything from first ( onward (TGX variant qualifiers)
        .trim();

    return withoutQualifiers.length >= MIN_MEANINGFUL_ROOM_NAME
        ? withoutQualifiers
        : withoutRateSuffix;
}

/**
 * Whether a room name says enough to choose a room by. Used when picking which of
 * several names should title a merged card — the shortest is normally the most
 * general, but not when it is a supplier code.
 */
export function isMeaningfulRoomName(name: string): boolean {
    return name.trim().length >= MIN_MEANINGFUL_ROOM_NAME;
}

/**
 * Extract the variant label from a TGX room name — the parenthetical portion.
 * "Standard Single room (smoking, extra bed not included)" → "smoking, extra bed not included"
 * Returns undefined if no parenthetical found.
 */
export function extractRoomVariantLabel(roomName: string): string | undefined {
    const matches = [...roomName.matchAll(/\(([^)]+)\)/g)].map(m => m[1].trim());
    return matches.length > 0 ? matches.join(', ') : undefined;
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
    const rate = roomType.rates?.[0];
    const tgxData = (rate as any)?._tgx;
    const rawName = getRoomDisplayName(roomType);
    const variantLabel = extractRoomVariantLabel(rawName);

    // Get cancellation deadline — check LiteAPI format first, then TGX cancelPenalties format
    const cancelDeadline = roomType.cancellationPolicies?.cancelPolicyInfos?.[0]?.cancelTime ||
                          roomType.cancellationPolicies?.cancelPolicyInfos?.[0]?.cancelDeadline ||
                          rate?.cancellationPolicies?.cancelPolicyInfos?.[0]?.cancelTime ||
                          rate?.cancellationPolicies?.cancelPolicyInfos?.[0]?.cancelDeadline ||
                          rate?.cancellationPolicy?.cancelPolicyInfos?.[0]?.cancelDeadline ||
                          // TGX format: cancelPenalties[0].deadline
                          tgxData?.cancelPolicy?.cancelPenalties?.[0]?.deadline;

    // For TGX rooms: OTV/RateHawk frequently returns cancelPolicy.refundable=false at search
    // time even when a free cancellation window exists. Derive refundability from the deadline
    // instead — if the first penalty deadline is in the future, free cancellation is available.
    // When no deadline is present and refundable=false (unreliable from OTV), return null to
    // signal "unknown" so the UI shows "Check at checkout" instead of "Non-Refundable".
    const refundable: boolean | null = tgxData
        ? (cancelDeadline
            ? new Date(cancelDeadline) > new Date()
            : tgxData?.cancelPolicy?.refundable === true ? true : null)
        : hasFreeCancellation(roomType, roomType.rates);

    // TGX payment type: MERCHANT = charged now, DIRECT = pay at hotel
    const rawPaymentType = tgxData?.paymentType;
    const paymentType = rawPaymentType === 'DIRECT' ? 'Pay at hotel'
        : rawPaymentType === 'MERCHANT' ? 'Pay now'
        : undefined;

    return {
        offerId: roomType.offerId || '',
        price: priceInfo.amount,
        currency: priceInfo.currency,
        boardType: rate?.boardType,
        boardName: rate?.boardName || 'Room only',
        refundable,
        cancellationDeadline: cancelDeadline,
        paymentType,
        variantLabel,
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

            // Keep the richer photo set
            if ((roomType.roomPhotos?.length ?? 0) > (existing.roomPhotos?.length ?? 0)) {
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
                amenities: roomType.amenities,
                roomOccupancy: extractOccupancyFromName(normalizedName),
            });
        }
    });

    // Sort rate options by price, then deduplicate by (price, boardName, refundable)
    groups.forEach((group) => {
        group.rateOptions.sort((a, b) => a.price - b.price);

        // Dedup: same board + same cancel category → keep cheapest only.
        // Rates are price-sorted, so the first kept is always the lowest price.
        const seen = new Set<string>();
        group.rateOptions = group.rateOptions.filter((rate) => {
            const cancelCat = rate.refundable === true ? 'free' : rate.refundable === false ? 'nrfn' : 'check';
            const key = `${rate.boardName || 'Room only'}|${cancelCat}|${rate.variantLabel || ''}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    });

    return Array.from(groups.values());
}

const OCCUPANCY_MAP: Record<string, string> = {
    single:    'Single · Sleeps 1',
    twin:      'Twin · Sleeps 2',
    double:    'Double · Sleeps 2',
    triple:    'Triple · Sleeps 3',
    quadruple: 'Quadruple · Sleeps 4',
    quintuple: 'Quintuple · Sleeps 5',
    sextuple:  'Sextuple · Sleeps 6',
};

function extractOccupancyFromName(name: string): string | undefined {
    const lower = name.toLowerCase();
    for (const [key, label] of Object.entries(OCCUPANCY_MAP)) {
        if (new RegExp(`\\b${key}\\b`).test(lower)) return label;
    }
    return undefined;
}

/** Extract the words in fullName that are absent from baseName (case-insensitive).
 *  Occupancy words (triple, quadruple…) are expanded to "Triple · Sleeps 3" labels. */
function extractDifferentiator(fullName: string, baseName: string): string | undefined {
    if (fullName === baseName) return undefined;
    const norm = (s: string) => s.toLowerCase();
    const baseWords = new Set(norm(baseName).split(/\s+/));
    const extra = fullName.split(/\s+/).filter(w => !baseWords.has(norm(w)));
    if (!extra.length) return undefined;
    // If any extra word is an occupancy keyword, use its rich label
    for (const w of extra) {
        const rich = OCCUPANCY_MAP[norm(w)];
        if (rich) return rich;
    }
    return extra.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

/**
 * Merge grouped rooms that share an identical photo URL set into a single card.
 * Groups with no photos are never merged.
 * The merged card uses the shortest room name as title and the richest amenity set.
 * Each rate option gets a `roomDifferentiator` badge for the words that distinguish
 * its source room from the base title (e.g. "Triple", "Quadruple").
 */
export function mergeGroupsByPhotos(groups: GroupedRoom[]): GroupedRoom[] {
    if (!groups.length) return groups;

    const photoGroups = new Map<string, GroupedRoom[]>();

    for (const group of groups) {
        const key = group.roomPhotos?.length
            ? [...group.roomPhotos].sort().join('\x00')
            : `\x01nophoto\x01${group.roomName}`;
        const bucket = photoGroups.get(key) ?? [];
        bucket.push(group);
        photoGroups.set(key, bucket);
    }

    const result: GroupedRoom[] = [];

    for (const bucket of photoGroups.values()) {
        if (bucket.length === 1) {
            result.push(bucket[0]);
            continue;
        }

        // Base title = shortest room name in the bucket, since the shortest is normally
        // the most general ("Deluxe Double room" over "Deluxe Double room, city view").
        // A supplier code would win that contest outright though, and title the whole
        // card "U", so codes are passed over unless every name in the bucket is one.
        const names = bucket.map(g => g.roomName);
        const shortest = (list: string[]) => list.reduce((a, b) => a.length <= b.length ? a : b);
        const readable = names.filter(isMeaningfulRoomName);
        const baseTitle = shortest(readable.length ? readable : names);

        // Richest amenity set
        const richestAmenities = bucket.map(g => g.amenities ?? []).reduce((a, b) => a.length >= b.length ? a : b);

        // Collect all rates with differentiator badge + sourceName
        const allRates: RateOption[] = [];
        for (const group of bucket) {
            const diff = extractDifferentiator(group.roomName, baseTitle);
            for (const rate of group.rateOptions) {
                allRates.push({ ...rate, roomDifferentiator: diff, sourceName: group.roomName });
            }
        }

        // Sort cheapest first across all merged room types
        allRates.sort((a, b) => a.price - b.price);

        // Deduplicate: include roomDifferentiator so variants aren't collapsed into each other
        const seen = new Set<string>();
        const dedupedRates = allRates.filter(rate => {
            const cancelCat = rate.refundable === true ? 'free' : rate.refundable === false ? 'nrfn' : 'check';
            const k = `${rate.boardName || 'Room only'}|${cancelCat}|${rate.variantLabel || ''}|${rate.roomDifferentiator || ''}`;
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
        });

        const cheapest = dedupedRates[0];
        result.push({
            ...bucket[0],
            roomName: baseTitle,
            amenities: richestAmenities,
            rateOptions: dedupedRates,
            lowestPrice: cheapest?.price ?? 0,
            currency: cheapest?.currency ?? bucket[0].currency,
            roomTypes: bucket.flatMap(g => g.roomTypes),
        });
    }

    return result;
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
 * Reorder each room's photos so the ones unique to it come first.
 *
 * Suppliers routinely give two rooms overlapping photo sets. Hotel Naru Seoul is
 * typical: "Deluxe Double room with river view" and "Premier Double room with
 * river view" are matched to their own ETG groups correctly, and those groups
 * still share 7 of their 10 photos. A card shows the first three, so both rooms
 * lead with the same shared shots and read as identical — the guest concludes
 * the site is broken, when every step upstream did its job.
 *
 * The shared photos are genuine pictures of both rooms, so they are kept; they
 * just should not lead. Ordering is stable within each part, so a room whose
 * photos are entirely shared is left exactly as it was.
 *
 * Only meaningful across the whole page, which is why this takes every group
 * rather than being a property of one.
 */
export function orderPhotosByDistinctiveness(groups: GroupedRoom[]): GroupedRoom[] {
    if (groups.length < 2) return groups;

    // How many rooms each photo appears in.
    const usage = new Map<string, number>();
    for (const group of groups) {
        for (const url of new Set(group.roomPhotos ?? [])) {
            usage.set(url, (usage.get(url) ?? 0) + 1);
        }
    }

    return groups.map(group => {
        const photos = group.roomPhotos;
        if (!photos?.length) return group;

        const unique = photos.filter(url => (usage.get(url) ?? 0) === 1);
        // Nothing to promote, or nothing but unique photos: leave the supplier's order alone.
        if (!unique.length || unique.length === photos.length) return group;

        const shared = photos.filter(url => (usage.get(url) ?? 0) > 1);
        return { ...group, roomPhotos: [...unique, ...shared] };
    });
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
