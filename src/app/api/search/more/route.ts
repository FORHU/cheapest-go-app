import { NextRequest, NextResponse } from 'next/server';
import { runTgxSearch } from '@/lib/server/stays/travelgatex/search';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const data = await runTgxSearch(body);
        return NextResponse.json(data);
    } catch (e: any) {
        console.error('[search/more] Error:', e.message);
        return NextResponse.json({ error: e.message, data: [], totalCount: 0 }, { status: 500 });
    }
}
