import { searchAirports } from '@/lib/airports';
import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

const DUFFEL_ACCESS_TOKEN = process.env.DUFFEL_ACCESS_TOKEN || '';
const DUFFEL_VERSION = 'beta';

// ─── Duffel Places Search ──────────────────────────────────────────

interface DuffelPlace {
    id: string;
    iata_code: string | null;
    name: string;
    city_name: string | null;
    country_name: string | null;
    type: 'airport' | 'city';
}

async function searchDuffel(query: string, limit: number) {
    if (!DUFFEL_ACCESS_TOKEN) return null;

    try {
        const res = await fetch(`https://api.duffel.com/places/suggestions?query=${encodeURIComponent(query)}&limit=${limit}`, {
            headers: {
                'Authorization': `Bearer ${DUFFEL_ACCESS_TOKEN}`,
                'Duffel-Version': DUFFEL_VERSION,
                'Content-Type': 'application/json'
            },
            signal: AbortSignal.timeout(4000),
        });

        if (!res.ok) return null;

        const json = await res.json();
        const locations: DuffelPlace[] = json.data || [];

        return locations
            .filter((loc) => loc.iata_code)
            .map((loc) => ({
                iata: loc.iata_code!,
                name: loc.name || loc.iata_code!,
                city: loc.city_name || loc.name || '',
                country: loc.country_name || '',
                countryCode: '', // Not always provided by Duffel Places in simple view
            }));
    } catch {
        return null;
    }
}

// ─── GET /api/airports/search?q=tokyo&limit=8 ───────────────────────

/**
 * Searches for airports using Duffel API (primary) with local dataset fallback.
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
        const [duffelResults, localResults] = await Promise.all([
            searchDuffel(query, limit),
            Promise.resolve(searchAirports(query, limit)),
        ]);

        // Merge: local first (curated major airports), then Duffel extras
        const seen = new Set<string>();
        const merged: typeof localResults = [];

        // Local results get priority (curated, major airports)
        for (const r of localResults) {
            if (!seen.has(r.iata)) {
                seen.add(r.iata);
                merged.push(r);
            }
        }

        // Add Duffel results that aren't already included
        if (duffelResults) {
            for (const r of duffelResults) {
                if (!seen.has(r.iata)) {
                    seen.add(r.iata);
                    merged.push(r);
                }
            }
        }

        return Response.json({
            success: true,
            data: merged.slice(0, limit),
        });
    } catch (err) {
        console.error('[airports/search] Error:', err);
        return Response.json(
            { success: false, error: 'Airport search failed' },
            { status: 500 },
        );
    }
}
