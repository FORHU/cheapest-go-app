/**
 * /api/search — client-side initial hotel search.
 * Delegates to fetchSearchProperties (same logic as SSR, reuses Next.js cache)
 * and returns the normalized queryParams so the client can use them for Load More.
 */
import { NextRequest, NextResponse } from 'next/server';
import { fetchSearchProperties, buildSearchQueryParams } from '@/lib/search';

export async function POST(req: NextRequest) {
    try {
        const rawParams = await req.json();
        const queryParams = buildSearchQueryParams(rawParams);
        const result = await fetchSearchProperties(rawParams);
        return NextResponse.json({ ...result, queryParams });
    } catch (e: any) {
        console.error('[/api/search] error:', e.message);
        return NextResponse.json(
            { properties: [], totalCount: 0, allMappable: [], queryParams: null },
            { status: 200 }
        );
    }
}
