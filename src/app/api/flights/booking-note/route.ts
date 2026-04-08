import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/utils/env';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    const { uniqueId, notes, bookingId } = await req.json();

    if (!uniqueId || !notes?.length) {
        return NextResponse.json({ success: false, error: 'uniqueId and notes are required' }, { status: 400 });
    }

    const supabaseUrl = env.SUPABASE_URL;
    const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY;

    // ── Call Mystifly edge function ──
    const res = await fetch(`${supabaseUrl}/functions/v1/mystifly-booking-note`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey,
        },
        body: JSON.stringify({ uniqueId, notes }),
    });

    const text = await res.text();
    console.log(`[booking-note] edge fn HTTP ${res.status}:`, text.slice(0, 300));

    let data: any;
    try {
        data = JSON.parse(text);
    } catch {
        return NextResponse.json({ success: false, error: `Edge function error (${res.status}): ${text.slice(0, 200)}` }, { status: 502 });
    }

    if (!data.success) {
        return NextResponse.json(data, { status: res.ok ? 200 : res.status });
    }

    // ── Save to Supabase if bookingId provided ──
    if (bookingId) {
        try {
            const supabase = createClient(supabaseUrl, supabaseKey);
            const rows = notes.map((note: string) => ({
                booking_id: bookingId,
                note,
            }));
            const { error } = await supabase.from('flight_booking_notes').insert(rows);
            if (error) console.error('[booking-note] Supabase insert error:', error.message);
        } catch (err: any) {
            console.error('[booking-note] Supabase save failed:', err.message);
        }
    }

    return NextResponse.json(data);
}
