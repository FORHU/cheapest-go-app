import { NextRequest, NextResponse } from 'next/server';
import { invokeEdgeFunction } from '@/utils/postgres/functions';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    const { uniqueId } = await req.json();
    if (!uniqueId) return NextResponse.json({ success: false, error: 'uniqueId is required' }, { status: 400 });
    try {
        const data = await invokeEdgeFunction('mystifly-trip-details', { uniqueId });
        return NextResponse.json(data);
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 502 });
    }
}
