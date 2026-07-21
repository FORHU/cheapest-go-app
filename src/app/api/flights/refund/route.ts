import { NextRequest, NextResponse } from 'next/server';
import { invokeEdgeFunction } from '@/utils/postgres/functions';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    const body = await req.json();
    if (!body.step || !['quote', 'execute'].includes(body.step)) {
        return NextResponse.json({ success: false, error: 'step must be "quote" or "execute"' }, { status: 400 });
    }
    try {
        const data = await invokeEdgeFunction('mystifly-refund', body);
        return NextResponse.json(data);
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 502 });
    }
}
