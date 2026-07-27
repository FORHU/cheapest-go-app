/**
 * Server-side data fetching utilities for property page.
 * These are pure functions that can be used in server components.
 */

import { cache } from 'react';
import { preBook } from '@/utils/postgres/functions';
import { runTgxSearch } from '@/lib/server/stays/travelgatex/search';
import { otvCodeToLabel } from '@/lib/server/stays/travelgatex/amenityCodes';
import { type Property } from '@/types';
import { getSqlAdmin } from '@/lib/db/postgres';
export type PropertyData = Property;

export interface StaticHotelResult {
    property: PropertyData;
    city: string;
    country: string;
    address: string;
}

/** Fast DB-only fetch — returns hotel shell from hotel_content in ~10ms, no TGX call. */
export async function fetchHotelStatic(id: string): Promise<StaticHotelResult | null> {
    try {
        const sql = getSqlAdmin();
        const rows = await sql`
            SELECT hotel_id, name, images, star_rating, lat, lng, address, city, country,
                   description, amenities, review_rating, review_count
            FROM hotel_content
            WHERE hotel_id = ${id}
            LIMIT 1
        `;
        if (!rows[0]) return null;
        const r = rows[0];
        const images: string[] = Array.isArray(r.images) ? r.images : [];
        const city = r.city || '';
        const country = r.country || '';
        const address = r.address || '';
        // amenities in hotel_content is jsonb — may be string[] (new) or [{code}] objects (old OTV rows).
        const rawAmenities = Array.isArray(r.amenities) ? r.amenities : [];
        const amenities: string[] = rawAmenities.flatMap((a: any) =>
            typeof a === 'string' ? [a] : a?.code ? [otvCodeToLabel(a.code)] : []
        ).filter(Boolean);
        const property: PropertyData = {
            id: r.hotel_id,
            name: r.name || id,
            location: [address, city, country].filter(Boolean).join(', '),
            description: r.description || '',
            rating: Number(r.review_rating ?? 0),
            reviews: Number(r.review_count ?? 0),
            price: 0,
            currency: 'USD',
            image: images[0] || '',
            images,
            amenities,
            badges: [],
            type: 'hotel',
            coordinates: { lat: Number(r.lat ?? 0), lng: Number(r.lng ?? 0) },
        };
        return { property, city, country, address };
    } catch (e: any) {
        console.error('[fetchHotelStatic]', e.message);
        return null;
    }
}

// Types
export interface SearchParamsInput {
    checkIn?: string;
    checkOut?: string;
    adults?: string | number;
    children?: string | number;
    rooms?: string | number;
    offerId?: string;
    currency?: string;
    nationality?: string;
    /** Duffel Stays rate ID — passed as URL param when navigating from search results */
    rateId?: string;
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

// Get default check-in/out dates — next Friday → Sunday (mirrors stream/route.ts logic).
// Same-day / next-day dates have near-zero OTV inventory.
export function getDefaultDates() {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sun … 6=Sat
    const daysUntilFriday = ((5 - dayOfWeek + 7) % 7) || 7; // at least 1 day ahead
    const checkin = new Date(now);
    checkin.setDate(now.getDate() + daysUntilFriday);
    const checkout = new Date(checkin);
    checkout.setDate(checkin.getDate() + 2); // Fri → Sun
    return { checkIn: formatDateForApi(checkin), checkOut: formatDateForApi(checkout) };
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
 * Fetch a Duffel Stays property by creating a quote for the rate.
 * The rate_id is passed as a URL search param when navigating from search results.
 */
async function fetchDuffelPropertyData(
    id: string,
    searchParams: SearchParamsInput
): Promise<FetchPropertyResult> {
    const rateId = searchParams.rateId;
    if (!rateId) {
        return { property: null, fetchedDetails: null, preBookResult: null };
    }

    try {
        const token = process.env.DUFFEL_ACCESS_TOKEN;
        if (!token) throw new Error('DUFFEL_ACCESS_TOKEN not set');

        const res = await fetch('https://api.duffel.com/stays/quotes', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Duffel-Version': 'v2',
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: JSON.stringify({ data: { rate_id: rateId } }),
        });

        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Duffel quote ${res.status}: ${text.slice(0, 200)}`);
        }

        const json = await res.json();
        const quote = json.data;
        const acc = quote?.accommodation ?? {};
        const rate = quote?.rooms?.[0]?.rates?.[0] ?? {};

        const property: PropertyData = {
            id,
            name: acc.name ?? 'Unknown Property',
            location: acc.location?.address?.line_1 ?? acc.location?.address?.city_name ?? '',
            description: acc.description ?? 'No description available',
            rating: acc.review_score ?? (acc.rating ? acc.rating * 2 : 0),
            reviews: acc.review_count ?? 0,
            price: parseFloat(rate.total_amount ?? '0'),
            currency: rate.total_currency ?? (searchParams.currency || 'USD'),
            image: acc.photos?.[0]?.url ?? '',
            images: (acc.photos ?? []).map((p: any) => p.url),
            amenities: (acc.amenities ?? []).map((a: any) => a.description ?? a.type),
            badges: [],
            type: 'hotel',
            coordinates: {
                lat: acc.location?.geographic?.latitude ?? 0,
                lng: acc.location?.geographic?.longitude ?? 0,
            },
            provider: 'duffel',
            rateId,
        };

        return { property, fetchedDetails: quote, preBookResult: { quoteId: quote?.id } };
    } catch (err) {
        console.error('[fetchDuffelPropertyData]', err instanceof Error ? err.message : err);
        return { property: null, fetchedDetails: null, preBookResult: null };
    }
}

/** True for TGX hotel codes (e.g. "KR2094") and ETG numeric IDs ("12345678"). */
function isTGXOrETGId(id: string): boolean {
    return /^\d+$/.test(id) || /^[A-Z]{2}\d+$/.test(id);
}

/** Look up what source populated this hotel in hotel_content. */
async function getHotelContentSource(id: string): Promise<string | null> {
    try {
        const sql = getSqlAdmin();
        const rows = await sql`SELECT content_source FROM hotel_content WHERE hotel_id = ${id} LIMIT 1`;
        return (rows[0]?.content_source as string) ?? null;
    } catch {
        return null;
    }
}

function getEtgToken(): string {
    const keyId  = process.env.ETG_KEY_ID  ?? '';
    const apiKey = process.env.ETG_API_KEY ?? '';
    return Buffer.from(`${keyId}:${apiKey}`).toString('base64');
}

/**
 * Fetch single-hotel availability from ETG B2B for hotels that came from the ETG
 * path (content_source = 'etg'). ETG IDs are string slugs not recognized by
 * TGX/OTV, so we hit ETG's own per-hotel availability endpoint (serp/hotels/).
 */
async function fetchETGPropertyData(
    id: string,
    searchParams: SearchParamsInput
): Promise<FetchPropertyResult> {
    try {
        if (!process.env.ETG_KEY_ID || !process.env.ETG_API_KEY) {
            return { property: null, fetchedDetails: null, preBookResult: null };
        }
        const defaults = getDefaultDates();
        let checkIn  = sanitizeDate(searchParams.checkIn  as string) || defaults.checkIn;
        let checkOut = sanitizeDate(searchParams.checkOut as string) || defaults.checkOut;
        if (checkIn <= formatDateForApi(new Date())) { checkIn = defaults.checkIn; if (checkOut <= checkIn) checkOut = defaults.checkOut; }

        // Pull static content from hotel_content (name/images/coords for display).
        const sql = getSqlAdmin();
        const rows = await sql`
            SELECT name, images, star_rating, lat, lng, address, city, country,
                   description, amenities, review_rating, review_count
            FROM hotel_content WHERE hotel_id = ${id} LIMIT 1
        `;
        const db = rows[0];
        const city    = (db?.city    as string) || '';
        const country = (db?.country as string) || '';

        // ETG per-hotel availability — direct slug lookup via serp/hotels/.
        // ETG IDs are string slugs (e.g. "au_royal_mad") that TGX/OTV can't resolve,
        // so these hotels MUST come from ETG. serp/hotels is reliable for a single
        // hotel (no region-list capping, unlike the old serp/region approach).
        let etgRates: any[] = [];
        const token = getEtgToken();
        const abort = new AbortController();
        const t = setTimeout(() => abort.abort(), 20_000);
        try {
            const res = await fetch('https://api.worldota.net/api/b2b/v3/search/serp/hotels/', {
                method: 'POST',
                headers: { 'Authorization': `Basic ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ids:       [id],
                    checkin:   checkIn,
                    checkout:  checkOut,
                    guests:    [{ adults: Number(searchParams.adults || 2) }],
                    currency:  'USD',
                    language:  'en',
                    residency: 'us',
                }),
                signal: abort.signal,
            });
            if (res.ok) {
                const json = await res.json();
                const hotels: any[] = json?.data?.hotels ?? [];
                const target = hotels.find((h: any) => String(h.id) === id);
                etgRates = target?.rates ?? [];
                console.log(`[fetchETGPropertyData] serp/hotels "${id}" → found=${!!target}, rates=${etgRates.length}`);
            } else {
                console.warn(`[fetchETGPropertyData] ETG serp/hotels ${res.status} for "${id}"`);
            }
        } catch (e: any) {
            console.warn(`[fetchETGPropertyData] ETG serp/hotels failed for "${id}":`, e?.message);
        } finally {
            clearTimeout(t);
        }

        const images: string[] = Array.isArray(db?.images) ? db.images : [];
        const property: PropertyData = {
            id,
            name:        (db?.name as string) || id,
            location:    [db?.address, city, country].filter(Boolean).join(', '),
            description: (db?.description as string) || '',
            rating:      Number(db?.review_rating ?? 0),
            reviews:     Number(db?.review_count ?? 0),
            price:       0,
            currency:    'USD',
            image:       images[0] || '',
            images,
            amenities:   [],
            badges:      [],
            type:        'hotel',
            coordinates: { lat: Number(db?.lat ?? 0), lng: Number(db?.lng ?? 0) },
        };

        // Map ETG rates → roomTypes shape expected by RoomList
        const roomTypes = etgRates.map((rate: any) => {
            const pt      = rate?.payment_options?.payment_types?.[0];
            const price   = parseFloat(pt?.show_amount ?? pt?.amount ?? '0');
            const currency = pt?.show_currency_code ?? pt?.currency_code ?? 'USD';
            const refundable = !!(rate?.no_show_time);
            return {
                offerId:      `ETG:${id}:${rate?.match_hash ?? Math.random()}`,
                roomName:     rate?.room_name || rate?.meal || 'Room',
                boardCode:    rate?.meal || 'RO',
                price,
                net:          price,
                gross:        price,
                currency,
                refundable,
                refundableTag: refundable ? 'REFUNDABLE' : 'NON_REFUNDABLE',
                cancelPolicy:  null,
                rates: [{
                    retailRate: {
                        total: [{ amount: price, currency }],
                        currency,
                    },
                    refundableTag: refundable ? 'REFUNDABLE' : 'NON_REFUNDABLE',
                    cancellationPolicies: [],
                    _etg: { matchHash: rate?.match_hash, meal: rate?.meal },
                }],
            };
        }).filter(r => r.price > 0)
          .sort((a, b) => a.price - b.price);

        const fetchedDetails = {
            hotelId:      id,
            name:         (db?.name as string) || id,
            roomTypes,
            images,
            image:        images[0] ?? '',
            lat:          Number(db?.lat ?? 0),
            lng:          Number(db?.lng ?? 0),
            coordinates:  { lat: Number(db?.lat ?? 0), lng: Number(db?.lng ?? 0) },
            address:      (db?.address as string) ?? '',
            city,
            country,
            description:  (db?.description as string) ?? '',
            amenities:    [],
            starRating:   Number(db?.star_rating ?? 0),
            reviewRating: Number(db?.review_rating ?? 0),
            reviewCount:  Number(db?.review_count ?? 0),
            currency:     'USD',
            provider:     'etg',
        };

        return { property, fetchedDetails, preBookResult: null };
    } catch (err) {
        console.error('[fetchETGPropertyData]', err instanceof Error ? err.message : err);
        return { property: null, fetchedDetails: null, preBookResult: null };
    }
}

/**
 * Fetch a TGX/ETG hotel using the travelgatex-search edge function's
 * single-hotel detail mode (hotelCode param → returns plain JSON, not NDJSON).
 */
export async function fetchTGXPropertyData(
    id: string,
    searchParams: SearchParamsInput
): Promise<FetchPropertyResult> {
    try {
        const defaults = getDefaultDates();
        let checkIn  = sanitizeDate(searchParams.checkIn  as string) || defaults.checkIn;
        let checkOut = sanitizeDate(searchParams.checkOut as string) || defaults.checkOut;
        if (checkIn <= formatDateForApi(new Date())) { checkIn = defaults.checkIn; if (checkOut <= checkIn) checkOut = defaults.checkOut; }

        // Call runTgxSearch in-process — the same function the search page uses.
        // (Previously an HTTP self-call to /api/fn/travelgatex-search, which broke
        //  silently when FUNCTIONS_BASE_URL/port didn't match the running server.)
        const result = await runTgxSearch({
            hotelCode: id,
            checkin:   checkIn,
            checkout:  checkOut,
            adults:    Number(searchParams.adults  || 2),
            children:  Number(searchParams.children || 0),
            rooms:     Number(searchParams.rooms   || 1),
            currency:  searchParams.currency || 'KRW',
            guest_nationality: searchParams.nationality || 'KR',
        });

        const hotel = result?.data;
        if (!hotel?.name) return { property: null, fetchedDetails: null, preBookResult: null };

        const images: string[] = hotel.images || (hotel.thumbnailUrl ? [hotel.thumbnailUrl] : []);
        const property: PropertyData = {
            id,
            name:        hotel.name,
            location:    [hotel.address, hotel.city, hotel.country].filter(Boolean).join(', ') || hotel.location || '',
            description: hotel.description || '',
            // Prefer ETG reviewRating (0-10); fall back to starRating*2 so 3★ shows ~6.0 rather than 0.
            rating:  hotel.reviewRating != null ? hotel.reviewRating
                   : (hotel.starRating  ?? 0) > 0 ? (hotel.starRating ?? 0) * 2
                   : 0,
            reviews: hotel.reviewCount ?? 0,
            price:       hotel.price     || hotel.roomTypes?.[0]?.rates?.[0]?.retailRate?.total?.[0]?.amount || 0,
            currency:    hotel.currency  || searchParams.currency || 'KRW',
            image:       images[0] || '',
            images,
            amenities:   (() => {
                const raw = hotel.hotelFacilities || hotel.amenities || [];
                if (!Array.isArray(raw)) return [];
                return raw.flatMap((a: any) =>
                    typeof a === 'string' ? [a] : a?.code ? [otvCodeToLabel(a.code)] : []
                ).filter(Boolean);
            })(),
            badges:      [],
            type:        'hotel',
            coordinates: hotel.coordinates || { lat: hotel.latitude || 0, lng: hotel.longitude || 0 },
        };

        return { property, fetchedDetails: hotel, preBookResult: null };
    } catch (err) {
        console.error('[fetchTGXPropertyData]', err instanceof Error ? err.message : err);
        return { property: null, fetchedDetails: null, preBookResult: null };
    }
}

/**
 * Route a single-hotel room-availability fetch to the correct provider by
 * content_source. ETG hotels have string-slug IDs that OTV/TGX cannot resolve, so
 * sending them to the TGX path always returns 0 rooms — they must go to ETG.
 * Used by the property page's rooms section (RoomsAvailabilitySection).
 */
export async function fetchRoomAvailability(
    id: string,
    searchParams: SearchParamsInput
): Promise<FetchPropertyResult> {
    if (id.startsWith('acc_')) return fetchDuffelPropertyData(id, searchParams);
    const source = await getHotelContentSource(id);
    if (source === 'etg') return fetchETGPropertyData(id, searchParams);
    return fetchTGXPropertyData(id, searchParams);
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
    // Duffel Stays hotels have accommodation IDs starting with "acc_"
    if (id.startsWith('acc_')) {
        return fetchDuffelPropertyData(id, searchParams);
    }
    let preBookResult = null;

    // 1. TGX/ETG hotel — route based on which provider sourced this hotel.
    //    ETG hotels use ETG IDs (not recognized by TGX/OTV) → must use ETG's own availability API.
    //    OTV hotels use OTV codes → use TGX.
    if (isTGXOrETGId(id)) {
        const source = await getHotelContentSource(id);
        if (source === 'etg') {
            return fetchETGPropertyData(id, searchParams);
        }
        return fetchTGXPropertyData(id, searchParams);
    }

    // 2. Invoke pre-book if offerId is present (non-TGX path)
    if (searchParams.offerId) {
        try {
            preBookResult = await preBook({
                offerId: searchParams.offerId as string,
                currency: searchParams.currency || 'KRW'
            });
        } catch (error: any) {
            console.error('Pre-book check failed:', error.message || error);
        }
    }

    // Build property from prebook result if available
    const property = (preBookResult || searchParams.offerId)
        ? createFallbackProperty(id, preBookResult, searchParams.currency || 'KRW')
        : null;

    return { property, fetchedDetails: null, preBookResult };
});
