import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/postgres/admin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const bookingId = req.nextUrl.searchParams.get('bookingId');
    if (!bookingId) return NextResponse.json({ success: false, error: 'bookingId is required' }, { status: 400 });

    const db = createAdminClient();
    const { data, error } = await db
        .from('flight_booking_notes')
        .select('note, created_at')
        .eq('booking_id', bookingId)
        .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, notes: data ?? [] });
}
