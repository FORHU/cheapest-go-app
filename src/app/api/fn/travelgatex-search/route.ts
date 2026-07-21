/**
 * POST /api/fn/travelgatex-search
 * HTTP entry point for the TravelgateX hotel search.
 * Core logic lives in src/lib/server/stays/travelgatex/search.ts
 * so it can be called directly without HTTP overhead.
 */

import { NextRequest, NextResponse } from 'next/server';
import { runTgxSearch } from '@/lib/server/stays/travelgatex/search';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const result = await runTgxSearch(body);
        return NextResponse.json(result);
    } catch (err: any) {
        console.error('[travelgatex-search] Error:', err.message);
        return NextResponse.json({ error: err.message, data: [], totalCount: 0 }, { status: 502 });
    }
}
