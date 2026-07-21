import { NextRequest, NextResponse } from 'next/server';
import { invokeEdgeFunction } from '@/utils/postgres/functions';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    const { mfRef, ticketNumber } = await req.json();
    if (!mfRef || !ticketNumber) return NextResponse.json({ success: false, error: 'mfRef and ticketNumber are required' }, { status: 400 });
    try {
        const data = await invokeEdgeFunction('mystifly-ticket-display', { mfRef, ticketNumber });
        return NextResponse.json(data);
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 502 });
    }
}
