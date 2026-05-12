/**
 * Supabase Edge Function client for mobile app.
 * Mirrors the web app's invokeEdgeFunction utility.
 */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config';

export async function invokeEdgeFunction<T = any>(
    functionName: string,
    body?: any
): Promise<T> {
    const functionUrl = `${SUPABASE_URL}/functions/v1/${functionName}`;
    const maxRetries = 3;
    let fallbackRetryDelay = 1500;

    for (let i = 0; i <= maxRetries; i++) {
        const response = await fetch(functionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'apikey': SUPABASE_ANON_KEY,
            },
            body: body ? JSON.stringify(body) : undefined,
        });

        if (response.ok) {
            return (await response.json()) as T;
        }

        let errorText = '';
        try { errorText = await response.text(); } catch { errorText = 'Could not read error'; }

        const is429 = response.status === 429 || errorText.includes('429');
        if (is429 && i < maxRetries) {
            const retryAfter = response.headers.get('retry-after');
            const delay = retryAfter ? parseInt(retryAfter) * 1000 : fallbackRetryDelay * Math.pow(2, i);

            await new Promise(r => setTimeout(r, delay));
            continue;
        }

        throw new Error(`Edge function ${functionName} failed: ${errorText.slice(0, 300)}`);
    }

    throw new Error(`Edge function ${functionName}: Max retries exceeded`);
}

// ─── Hotel Search APIs ───

export interface Destination {
    type: 'city' | 'country' | 'history';
    title: string;
    subtitle: string;
    countryCode?: string;
    id?: string;
    code?: string;
}

const countryMap: Record<string, string> = {
    'Philippines': 'PH', 'Thailand': 'TH', 'Japan': 'JP', 'Korea': 'KR', 'South Korea': 'KR',
    'United States': 'US', 'USA': 'US', 'United Kingdom': 'GB', 'UK': 'GB', 'Vietnam': 'VN',
    'Singapore': 'SG', 'Malaysia': 'MY', 'Indonesia': 'ID', 'France': 'FR', 'Germany': 'DE',
    'Italy': 'IT', 'Spain': 'ES', 'Australia': 'AU', 'Canada': 'CA', 'China': 'CN'
};

function getCountryCodeFromAddress(address: string): string {
    if (!address) return '';
    const parts = address.split(',').map(p => p.trim());
    const lastPart = parts[parts.length - 1];
    return countryMap[lastPart] || '';
}

export async function autocompleteDestinations(keyword: string): Promise<Destination[]> {
    if (!keyword || keyword.length < 2) return [];
    try {
        const result = await invokeEdgeFunction<{ data?: any[] }>('liteapi-autocomplete', { keyword });
        return (result?.data ?? []).map((item: any) => ({
            type: 'city' as const,
            title: item.displayName || item.name || '',
            subtitle: item.formattedAddress || item.address || '',
            countryCode: item.countryCode || getCountryCodeFromAddress(item.formattedAddress || item.address),
            id: item.placeId || item.id,
        }));
    } catch (err) {

        return [];
    }
}

export interface HotelSearchParams {
    destination: string;
    countryCode?: string;
    placeId?: string;
    checkIn: string; // YYYY-MM-DD
    checkOut: string;
    adults: number;
    children: number;
    rooms: number;
    currency?: string;
}

export async function searchHotels(params: HotelSearchParams) {
    let { destination, countryCode, placeId } = params;

    // If we're missing both countryCode and placeId, try to resolve via autocomplete first
    // This handles cases where the user types and hits search without selecting a suggestion.
    if (!placeId && !countryCode && destination) {
        try {

            const suggestions = await autocompleteDestinations(destination);
            if (suggestions.length > 0) {
                placeId = suggestions[0].id;
                countryCode = suggestions[0].countryCode;

            }
        } catch (err) {

        }
    }

    return invokeEdgeFunction('liteapi-search', {
        cityName: destination,
        countryCode: countryCode,
        placeId: placeId,
        checkin: params.checkIn,
        checkout: params.checkOut,
        adults: params.adults,
        children: params.children,
        rooms: params.rooms,
        currency: params.currency || 'USD',
    });
}

export async function getHotelDetails(hotelId: string, options: any = {}) {
    const { checkIn, checkOut, adults, children, rooms, currency } = options;
    const result = await invokeEdgeFunction('liteapi-search', {
        hotelIds: [hotelId],
        checkin: checkIn,
        checkout: checkOut,
        adults: adults || 2,
        children: children || 0,
        rooms: rooms || 1,
        currency: currency || 'USD'
    });
    return result?.data?.[0] || null;
}

export async function getHotelReviews(hotelId: string, limit: number = 20) {
    const result = await invokeEdgeFunction('liteapi-reviews', { hotelId, limit });
    return result?.data || [];
}

// ─── Flight Search APIs ───

export interface Airport {
    iata: string;
    name: string;
    city: string;
    country: string;
    countryCode: string;
}

export interface FlightSearchParams {
    origin: string;
    destination: string;
    departureDate: string;
    returnDate?: string;
    adults: number;
    children?: number;
    infants?: number;
    cabinClass?: string;
    tripType: 'one-way' | 'round-trip';
}

export async function searchFlights(params: FlightSearchParams) {
    return invokeEdgeFunction('unified-flight-search', {
        segments: [
            {
                origin: params.origin.toUpperCase(),
                destination: params.destination.toUpperCase(),
                departureDate: params.departureDate
            },
            ...(params.returnDate ? [{
                origin: params.destination.toUpperCase(),
                destination: params.origin.toUpperCase(),
                departureDate: params.returnDate
            }] : [])
        ],
        tripType: params.tripType,
        adults: params.adults,
        children: params.children || 0,
        infants: params.infants || 0,
        cabinClass: params.cabinClass?.toLowerCase().replace(' ', '_') || 'economy',
    });
}

export async function autocompleteAirports(keyword: string): Promise<Airport[]> {
    if (!keyword || keyword.length < 2) return [];
    try {
        // We'll use the same edge function for airports if it exists, 
        // or a dedicated one. For now, we'll assume 'airport-autocomplete'.
        const result = await invokeEdgeFunction<{ data?: any[] }>('airport-autocomplete', { keyword });
        return (result?.data ?? []).map((item: any) => ({
            iata: item.iata,
            name: item.name,
            city: item.city,
            country: item.country,
            countryCode: item.countryCode,
        }));
    } catch (err) {

        return [];
    }
}
