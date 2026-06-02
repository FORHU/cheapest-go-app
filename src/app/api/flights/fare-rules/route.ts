import { NextRequest, NextResponse } from 'next/server';
import { invokeEdgeFunction } from '@/utils/postgres/functions';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    const { fareSourceCode } = await req.json();

    if (!fareSourceCode) {
        return NextResponse.json({ success: false, error: 'fareSourceCode is required' }, { status: 400 });
    }

    try {
        const data = await invokeEdgeFunction('mystifly-fare-rules', { fareSourceCode });
        return NextResponse.json(data);
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 502 });
    }
}
