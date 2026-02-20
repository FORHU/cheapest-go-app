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

        // Fetch from both sources and merge (local results ensure major airports always appear)
        const [amadeusResults, localResults] = await Promise.all([
            searchAmadeus(query, limit),
            Promise.resolve(searchAirports(query, limit)),
        ]);

        // Merge: local first (curated major airports), then Amadeus extras
        const seen = new Set<string>();
        const merged: typeof localResults = [];

        // Local results get priority (curated, major airports)
        for (const r of localResults) {
            if (!seen.has(r.iata)) {
                seen.add(r.iata);
                merged.push(r);
            }
        }

        // Add Amadeus results that aren't already included
        if (amadeusResults) {
            for (const r of amadeusResults) {
                if (!seen.has(r.iata)) {
                    seen.add(r.iata);
                    merged.push(r);
                }
            }
        }

        return Response.json({
            success: true,
            data: merged.slice(0, limit),
            source: amadeusResults ? 'merged' : 'local',
        });
    } catch (err) {
        console.error('[airports/search] Error:', err);
        return Response.json(
            { success: false, error: 'Airport search failed' },
            { status: 500 },
        );
    }
}
