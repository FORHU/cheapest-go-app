import { searchAirports } from '@/lib/airports';
import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

const AMADEUS_API_KEY = process.env.AMADEUS_API_KEY || '';
const AMADEUS_API_SECRET = process.env.AMADEUS_API_SECRET || '';
const AMADEUS_BASE_URL = process.env.AMADEUS_BASE_URL || '';

// ─── Amadeus OAuth2 Token ────────────────────────────────────────────

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAmadeusToken(): Promise<string | null> {
    if (!AMADEUS_API_KEY || !AMADEUS_API_SECRET || !AMADEUS_BASE_URL) return null;

    if (cachedToken && Date.now() < cachedToken.expiresAt) {
        return cachedToken.token;
    }

    try {
        const res = await fetch(`${AMADEUS_BASE_URL}/v1/security/oauth2/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `grant_type=client_credentials&client_id=${AMADEUS_API_KEY}&client_secret=${AMADEUS_API_SECRET}`,
        });

        if (!res.ok) return null;

        const json = await res.json();
        cachedToken = {
            token: json.access_token,
            expiresAt: Date.now() + (json.expires_in - 60) * 1000,
        };
        return cachedToken.token;
    } catch {
        return null;
    }
}

// ─── Amadeus Airport Search ──────────────────────────────────────────

interface AmadeusLocation {
    iataCode: string;
    name: string;
    address?: {
        cityName?: string;
        countryName?: string;
        countryCode?: string;
    };
    subType?: string;
}

async function searchAmadeus(query: string, limit: number) {
    const token = await getAmadeusToken();
    if (!token) return null;

    try {
        const url = new URL(`${AMADEUS_BASE_URL}/v1/reference-data/locations`);
        url.searchParams.set('subType', 'AIRPORT,CITY');
        url.searchParams.set('keyword', query);
        url.searchParams.set('sort', 'analytics.travelers.score');
        url.searchParams.set('page[limit]', String(limit));
        url.searchParams.set('view', 'LIGHT');

        const res = await fetch(url.toString(), {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(4000),
        });

        if (!res.ok) return null;

        const json = await res.json();
        const locations: AmadeusLocation[] = json.data || [];

        return locations
            .filter((loc) => loc.iataCode)
            .map((loc) => ({
                iata: loc.iataCode,
                name: loc.name || loc.iataCode,
                city: loc.address?.cityName || loc.name || '',
                country: loc.address?.countryName || '',
                countryCode: loc.address?.countryCode || '',
            }));
    } catch {
        return null;
    }
}

// ─── GET /api/airports/search?q=tokyo&limit=8 ───────────────────────

/**
 * Searches for airports using Amadeus API (primary) with local dataset fallback.
 * Returns matching airports sorted by relevance.
 */
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = req.nextUrl;
        const query = searchParams.get('q') || '';
        const limit = Math.min(parseInt(searchParams.get('limit') || '8', 10), 20);

        if (!query || query.length < 1) {
            return Response.json({ success: true, data: [] });
        }

        // Try Amadeus first, fall back to local dataset
        const amadeusResults = await searchAmadeus(query, limit);

        if (amadeusResults && amadeusResults.length > 0) {
            return Response.json({
                success: true,
                data: amadeusResults,
                source: 'amadeus',
            });
        }

        // Fallback to local dataset
        const results = searchAirports(query, limit);
        return Response.json({
            success: true,
            data: results,
            source: 'local',
        });
    } catch (err) {
        console.error('[airports/search] Error:', err);
        return Response.json(
            { success: false, error: 'Airport search failed' },
            { status: 500 },
        );
    }
}
