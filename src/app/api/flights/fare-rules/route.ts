import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/utils/env';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    const { fareSourceCode } = await req.json();

    if (!fareSourceCode) {
        return NextResponse.json({ success: false, error: 'fareSourceCode is required' }, { status: 400 });
    }

    const supabaseUrl = env.SUPABASE_URL;
    const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY;

    const res = await fetch(`${supabaseUrl}/functions/v1/mystifly-fare-rules`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey,
        },
        body: JSON.stringify({ fareSourceCode }),
    });

    const text = await res.text();
    console.log(`[fare-rules] edge fn HTTP ${res.status}:`, text.slice(0, 300));

    let data: any;
    try {
        data = JSON.parse(text);
    } catch {
        return NextResponse.json({ success: false, error: `Edge function error (${res.status}): ${text.slice(0, 200)}` }, { status: 502 });
    }

    return NextResponse.json(data, { status: res.ok ? 200 : res.status });
}
