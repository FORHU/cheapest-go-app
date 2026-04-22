import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/utils/env';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    const { mfRef, ticketNumber } = await req.json();

    if (!mfRef || !ticketNumber) {
        return NextResponse.json({ success: false, error: 'mfRef and ticketNumber are required' }, { status: 400 });
    }

    const supabaseUrl = env.SUPABASE_URL;
    const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY;

    const res = await fetch(`${supabaseUrl}/functions/v1/mystifly-ticket-display`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey,
        },
        body: JSON.stringify({ mfRef, ticketNumber }),
    });

    const text = await res.text();
    console.log(`[ticket-display] edge fn HTTP ${res.status}:`, text.slice(0, 300));

    let data: any;
    try {
        data = JSON.parse(text);
    } catch {
        return NextResponse.json({ success: false, error: `Edge function error (${res.status}): ${text.slice(0, 200)}` }, { status: 502 });
    }

    return NextResponse.json(data, { status: res.ok ? 200 : res.status });
}
