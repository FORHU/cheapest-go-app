import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/utils/env';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const bookingId = req.nextUrl.searchParams.get('bookingId');

    if (!bookingId) {
        return NextResponse.json({ success: false, error: 'bookingId is required' }, { status: 400 });
    }

    const supabaseUrl = env.SUPABASE_URL;
    const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await supabase
        .from('flight_booking_notes')
        .select('note, created_at')
        .eq('booking_id', bookingId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('[booking-notes] Supabase error:', error.message);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, notes: data ?? [] });
}
