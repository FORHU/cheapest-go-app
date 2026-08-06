import { NextResponse } from 'next/server';
import { requireAdmin, isAuthError } from '@/lib/server/admin';
import { env } from '@/utils/env';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/tgx-health
 * Client-side health check for TravelgateX — called after page load so it
 * doesn't block the admin page render.
 */
export async function GET(req: Request) {
    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    const apiKey = env.TRAVELGATE_API_KEY;
    const accessCode = env.TRAVELGATE_CODE || '38327';
    const endpoint = env.TRAVELGATE_ENDPOINT_URL || 'https://api.travelgate.com';

    if (!apiKey) {
        return NextResponse.json({ otvStatus: 'unknown' });
    }

    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Apikey ${apiKey}`,
                'Content-Type': 'application/json',
                'Accept-Encoding': 'gzip',
            },
            body: JSON.stringify({
                query: `query { hotelX { destinationSearcher(criteria: { access: "${accessCode}", text: "Paris", maxSize: 1 }) { ... on DestinationData { code type } } } }`,
            }),
            signal: AbortSignal.timeout(12000),
        });

        if (!res.ok) return NextResponse.json({ otvStatus: 'no_rates' });

        const body = await res.json();
        const results = body?.data?.hotelX?.destinationSearcher;
        const otvStatus = Array.isArray(results) && results.length > 0 ? 'active' : 'no_rates';
        return NextResponse.json({ otvStatus });
    } catch {
        return NextResponse.json({ otvStatus: 'unknown' });
    }
}
