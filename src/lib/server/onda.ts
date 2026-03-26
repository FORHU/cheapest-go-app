/**
 * Server-side ONDA Channel Partner API client.
 *
 * Base URL:
 *   Dev:  https://dapi.tport.dev
 *   Prod: https://gds.tport.io  (set ONDA_BASE_URL env var)
 *
 * Auth: x-api-key + x-channel-key headers (both use ONDA_API_KEY env var unless
 * ONDA_CHANNEL_KEY is set separately).
 */

import type { Property } from '@/types';
import type { RoomType } from '@/lib/room/roomUtils';

// ── Env ─────────────────────────────────────────────────────────────────────

const ONDA_BASE_URL = process.env.ONDA_BASE_URL ?? 'https://dapi.tport.dev';
export const ONDA_API_KEY = process.env.ONDA_API_KEY ?? '';
const ONDA_CHANNEL_KEY = process.env.ONDA_CHANNEL_KEY ?? ONDA_API_KEY;

// In the dev environment, ONDA only exposes these two test properties.
// In production (gds.tport.io) this is left empty so all properties are searched.
export const ONDA_DEV_PROPERTY_IDS: string[] = ONDA_BASE_URL.includes('dapi.tport.dev')
    ? (process.env.ONDA_DEV_PROPERTY_IDS ?? '117417,120135').split(',').map(s => s.trim()).filter(Boolean)
    : [];

// ── Low-level HTTP ───────────────────────────────────────────────────────────

function ondaHeaders(locale = 'en-US'): Record<string, string> {
    return {
        'Content-Type': 'application/json',
        'x-api-key': ONDA_API_KEY,
        'x-channel-key': ONDA_CHANNEL_KEY,
        'locale': locale,
    };
}

export async function ondaGet<T = any>(path: string, locale = 'en-US'): Promise<T> {
    const res = await fetch(`${ONDA_BASE_URL}${path}`, {
        method: 'GET',
        headers: ondaHeaders(locale),
        cache: 'no-store',
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`ONDA ${res.status} on GET ${path}: ${text.slice(0, 300)}`);
    }
    return res.json() as Promise<T>;
}

export async function ondaPost<T = any>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${ONDA_BASE_URL}${path}`, {
        method: 'POST',
        headers: ondaHeaders(),
        body: JSON.stringify(body),
        cache: 'no-store',
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`ONDA ${res.status} on POST ${path}: ${text.slice(0, 300)}`);
    }
    return res.json() as Promise<T>;
}

export async function ondaPut<T = any>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${ONDA_BASE_URL}${path}`, {
        method: 'PUT',
        headers: ondaHeaders(),
        body: JSON.stringify(body),
        cache: 'no-store',
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`ONDA ${res.status} on PUT ${path}: ${text.slice(0, 300)}`);
    }
    return res.json() as Promise<T>;
}

// ── ONDA API Shapes ──────────────────────────────────────────────────────────

export interface OndaAvailableProperty {
    property_id: string;
    basic_price: number;
    sale_price: number;
    capacity: { standard: number; max: number };
}

export interface OndaPropertyImage {
    original: string;
    '250px': string;
    '500px': string;
    '1000px': string;
    description?: string;
    order?: number;
}

export interface OndaPropertyDetail {
    id: string;
    name: string;
    status: string;
    address: {
        country_code: string;
        region: string;
        city: string;
        address1: string;
        address2?: string;
        address_detail?: string;
        postal_code?: string;
        location?: { latitude: number; longitude: number };
    };
    classifications?: string[];
    phone?: string;
    email?: string;
    checkin?: string;
    checkout?: string;
    confirm_type?: string;
    descriptions?: {
        property?: string;
        reservation?: string;
        notice?: string;
        refunds?: string;
    };
    tags?: {
        properties?: string[];
        facilities?: string[];
        services?: string[];
        attractions?: string[];
        amenities?: string[];
    };
    images?: OndaPropertyImage[];
    property_refunds?: {
        '0d'?: number;
        '1d'?: number;
        '3d'?: number;
        '5d'?: number;
        '10d'?: number;
    };
    updated_at?: string;
}

export interface OndaRefundPolicy {
    until: string;
    percent: number;
    refund_amount: number;
    charge_amount: number;
}

export interface OndaRateplanAvail {
    rateplan_id: string;
    rateplan_name: string;
    type: 'standalone' | 'package';
    currency: string;
    nights: Array<{ date: string; basic_price: number; sale_price: number; extra_person_fee?: number }>;
    total: { basic_price: number; sale_price: number };
    refundable: boolean;
    refund_policy: OndaRefundPolicy[];
    meal: { breakfast: boolean; lunch: boolean; dinner: boolean; meal_count: number };
    length_of_stay?: { min: number; max: number };
}

export interface OndaRoomTypeAvail {
    roomtype_id: string;
    roomtype_name: string;
    capacity: { standard: number; max: number };
    rateplans: OndaRateplanAvail[];
}

export interface OndaBookingResponse {
    property_id: string;
    property_name: string;
    booking_number: string;
    channel_booking_number: string;
    status: 'pending' | 'confirmed' | 'canceled';
    checkin: string;
    checkout: string;
    currency: string;
    total_amount: number;
    rateplans: Array<{
        vendor_booking_number?: string;
        roomtype_id: string;
        roomtype_name: string;
        rateplan_id: string;
        rateplan_name: string;
        amount: number;
        refundable: boolean;
        refund_policy: OndaRefundPolicy[];
    }>;
    booker: {
        name: string;
        email: string;
        phone: string;
        nationality: string;
        timezone: string;
    };
    requested_at: string;
    created_at: string;
}

// ── ONDA Prebook offerId encoding ────────────────────────────────────────────
//
// Format: "onda:{propertyId}:{roomtypeId}:{rateplanId}:{krwAmount}:{checkin}:{checkout}"
// Example: "onda:117417:1459423:1405883:104250:2026-06-01:2026-06-05"

export interface OndaOfferIds {
    propertyId: string;
    roomtypeId: string;
    rateplanId: string;
    krwAmount: number;
    checkin: string;
    checkout: string;
}

export function encodeOndaOfferId(ids: OndaOfferIds): string {
    return `onda:${ids.propertyId}:${ids.roomtypeId}:${ids.rateplanId}:${ids.krwAmount}:${ids.checkin}:${ids.checkout}`;
}

export function parseOndaOfferId(offerId: string): OndaOfferIds | null {
    if (!offerId.startsWith('onda:')) return null;
    const parts = offerId.split(':');
    // "onda:propertyId:roomtypeId:rateplanId:krwAmount:checkin:checkout"
    // checkin/checkout contain dashes so they're at fixed positions
    if (parts.length < 8) return null;
    const [, propertyId, roomtypeId, rateplanId, krwAmountStr, ...rest] = parts;
    // rest = ['2026', '06', '01', '2026', '06', '05'] (dates split on ':' but they only have '-' not ':')
    // Actually YYYY-MM-DD has no ':', so checkin = parts[5], checkout = parts[6]
    const checkin = parts[5];
    const checkout = parts[6];
    const krwAmount = parseInt(krwAmountStr, 10);
    if (!propertyId || !roomtypeId || !rateplanId || isNaN(krwAmount) || !checkin || !checkout) return null;
    return { propertyId, roomtypeId, rateplanId, krwAmount, checkin, checkout };
}

// ── API Calls ────────────────────────────────────────────────────────────────

/** Search all available properties for given dates */
export async function ondaSearchAvailableProperties(params: {
    checkin: string;
    checkout: string;
    adult: number;
    childrenAges?: number[];
    propertyIds?: string[];
}): Promise<OndaAvailableProperty[]> {
    let url = `/search/properties?checkin=${params.checkin}&checkout=${params.checkout}&adult=${params.adult}`;
    if (params.childrenAges?.length) {
        for (const age of params.childrenAges) url += `&child_age[]=${age}`;
    }
    const propertyIds = params.propertyIds?.length ? params.propertyIds : ONDA_DEV_PROPERTY_IDS;
    for (const id of propertyIds) url += `&property_id[]=${id}`;
    const data = await ondaGet<{ properties: OndaAvailableProperty[] }>(url);
    return data.properties ?? [];
}

/** Get full property details (name, address, images, etc.) */
export async function ondaGetProperty(propertyId: string): Promise<OndaPropertyDetail> {
    const data = await ondaGet<{ property: OndaPropertyDetail }>(`/properties/${propertyId}`);
    return data.property;
}

/** Search available room types + rates for a specific property */
export async function ondaSearchPropertyDetail(
    propertyId: string,
    params: { checkin: string; checkout: string; adult: number; childrenAges?: number[] }
): Promise<OndaRoomTypeAvail[]> {
    let url = `/search/properties/${propertyId}?checkin=${params.checkin}&checkout=${params.checkout}&adult=${params.adult}`;
    if (params.childrenAges?.length) {
        for (const age of params.childrenAges) url += `&child_age[]=${age}`;
    }
    const data = await ondaGet<{ property_id: string; roomtypes: OndaRoomTypeAvail[] }>(url);
    return data.roomtypes ?? [];
}

/** Verify room availability before booking */
export async function ondaCheckAvail(
    propertyId: string,
    roomtypeId: string,
    rateplanId: string,
    checkin: string,
    checkout: string,
): Promise<{ availability: boolean; dates: Array<{ date: string; vacancy: number }> }> {
    const url = `/properties/${propertyId}/roomtypes/${roomtypeId}/rateplans/${rateplanId}/checkavail?checkin=${checkin}&checkout=${checkout}`;
    return ondaGet(url);
}

/** Get dynamic cancellation/refund policy for a specific room before booking */
export async function ondaGetRefundPolicy(
    propertyId: string,
    roomtypeId: string,
    rateplanId: string,
    checkin: string,
    checkout: string,
): Promise<{ refund_policy: OndaRefundPolicy[]; refund_type?: string }> {
    const url = `/properties/${propertyId}/roomtypes/${roomtypeId}/rateplans/${rateplanId}/refund_policy?checkin=${checkin}&checkout=${checkout}`;
    return ondaGet(url);
}

/** Create a booking with ONDA */
export async function ondaCreateBooking(
    propertyId: string,
    body: {
        currency: string;
        channel_booking_number: string;
        checkin: string;
        checkout: string;
        rateplans: Array<{
            rateplan_id: string;
            amount: number;
            number_of_guest: { adult: number; child_age?: number[] };
            guests: Array<{ name: string; email?: string; phone?: string; nationality?: string }>;
        }>;
        booker: { name: string; email: string; phone: string; nationality: string; timezone: string };
    }
): Promise<OndaBookingResponse> {
    return ondaPost(`/properties/${propertyId}/bookings`, body);
}

/** Get a booking by booking_number */
export async function ondaGetBooking(
    propertyId: string,
    bookingNumber: string,
): Promise<OndaBookingResponse> {
    return ondaGet(`/properties/${propertyId}/bookings/${bookingNumber}?type=booking_number`);
}

/** Cancel a booking */
export async function ondaCancelBooking(
    propertyId: string,
    bookingNumber: string,
    body: {
        canceled_by: 'user' | 'system';
        reason?: string;
        currency: string;
        total_amount: number;
        refund_amount: number;
    }
): Promise<{ booking_number: string; refund_amount: number; total_amount: number; currency: string }> {
    return ondaPut(`/properties/${propertyId}/bookings/${bookingNumber}/cancel`, body);
}

// ── Data Transformers ────────────────────────────────────────────────────────

function mapClassification(classifications?: string[]): 'hotel' | 'apartment' | 'resort' | 'villa' {
    const first = classifications?.[0]?.toLowerCase() ?? '';
    if (first.includes('resort')) return 'resort';
    if (first.includes('villa') || first.includes('pool villa')) return 'villa';
    if (first.includes('residence') || first.includes('guesthouse')) return 'apartment';
    return 'hotel';
}

function pickImage(img: OndaPropertyImage): string {
    return img['1000px'] || img['500px'] || img.original || '';
}

/** Transform ONDA property detail + available price → app Property */
export function mapOndaPropertyToProperty(
    ondaProp: OndaPropertyDetail,
    salePrice: number,
): Property {
    const addr = ondaProp.address ?? {} as any;
    const locationParts = [addr.address1, addr.city, addr.region].filter(Boolean);
    const location = locationParts.join(', ') || 'Korea';
    const images = (ondaProp.images ?? []).map(pickImage).filter(Boolean);

    return {
        id: ondaProp.id,
        name: ondaProp.name,
        location,
        description: ondaProp.descriptions?.property || ondaProp.descriptions?.reservation || 'No description available',
        rating: 0,
        reviews: 0,
        price: salePrice,
        currency: 'KRW',
        image: images[0] || 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&q=80&w=800',
        images,
        amenities: ondaProp.tags?.facilities ?? [],
        badges: ondaProp.tags?.properties ?? [],
        type: mapClassification(ondaProp.classifications),
        coordinates: {
            lat: addr.location?.latitude ?? 0,
            lng: addr.location?.longitude ?? 0,
        },
        refundableTag: undefined,
        distance: undefined,
        boardTypes: [],
    };
}

/** Transform ONDA room types from Search Property Detail → app RoomType[] */
export function mapOndaRoomTypesToRoomTypes(
    propertyId: string,
    ondaRoomTypes: OndaRoomTypeAvail[],
    checkin: string,
    checkout: string,
): RoomType[] {
    const result: RoomType[] = [];

    for (const rt of ondaRoomTypes) {
        for (const rp of rt.rateplans) {
            const salePrice = rp.total?.sale_price ?? 0;
            const offerId = encodeOndaOfferId({
                propertyId,
                roomtypeId: rt.roomtype_id,
                rateplanId: rp.rateplan_id,
                krwAmount: salePrice,
                checkin,
                checkout,
            });

            const mealLabel = rp.meal?.meal_count > 0
                ? [rp.meal.breakfast && 'Breakfast', rp.meal.lunch && 'Lunch', rp.meal.dinner && 'Dinner']
                    .filter(Boolean).join(' + ')
                : 'Room only';

            const cancelPolicyInfos = (rp.refund_policy ?? []).map(p => ({
                cancelTime: p.until,
                cancelDeadline: p.until,
                amount: p.charge_amount ?? 0,
                currency: rp.currency || 'KRW',
                type: p.percent === 100 ? 'FREE' : p.percent === 0 ? 'NO_REFUND' : 'PARTIAL',
            }));

            result.push({
                offerId,
                name: `${rt.roomtype_name} — ${rp.rateplan_name}`,
                roomName: rt.roomtype_name,
                maxOccupancy: rt.capacity?.max,
                rates: [{
                    rateId: rp.rateplan_id,
                    name: rp.rateplan_name,
                    boardType: rp.meal?.meal_count > 0 ? 'BB' : 'RO',
                    boardName: mealLabel,
                    maxOccupancy: rt.capacity?.max,
                    retailRate: {
                        total: [{ amount: salePrice, currency: rp.currency || 'KRW' }],
                    },
                    refundableTag: rp.refundable ? 'RFN' : 'NRFN',
                    cancellationPolicies: {
                        refundableTag: rp.refundable ? 'RFN' : 'NRFN',
                        cancelPolicyInfos,
                    },
                }],
                amenities: [],
                roomPhotos: [],
            });
        }
    }

    return result;
}
