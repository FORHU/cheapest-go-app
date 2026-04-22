import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/utils/env';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    const { mfRef, passengers, originDestinations } = await req.json();

    if (!mfRef) {
        return NextResponse.json({ success: false, error: 'mfRef is required' }, { status: 400 });
    }
    if (!passengers || !Array.isArray(passengers) || passengers.length === 0) {
        return NextResponse.json({ success: false, error: 'passengers array is required' }, { status: 400 });
    }
    if (!originDestinations || !Array.isArray(originDestinations) || originDestinations.length === 0) {
        return NextResponse.json({ success: false, error: 'originDestinations array is required' }, { status: 400 });
    }

    const supabaseUrl = env.SUPABASE_URL;
    const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY;

    const res = await fetch(`${supabaseUrl}/functions/v1/mystifly-void-quote`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey,
        },
        body: JSON.stringify({ mfRef, passengers, originDestinations }),
    });

    const text = await res.text();
    console.log(`[void-quote] edge fn HTTP ${res.status}:`, text.slice(0, 300));

    let data: any;
    try {
        data = JSON.parse(text);
    } catch {
        return NextResponse.json({ success: false, error: `Edge function error (${res.status}): ${text.slice(0, 200)}` }, { status: 502 });
    }

    return NextResponse.json(data, { status: res.ok ? 200 : res.status });
}
