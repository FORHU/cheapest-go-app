import { NextRequest, NextResponse } from 'next/server';
import { invokeEdgeFunction } from '@/utils/postgres/functions';
import { createAdminClient } from '@/utils/postgres/admin';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    const { uniqueId, notes, bookingId } = await req.json();
    if (!uniqueId || !notes?.length) {
        return NextResponse.json({ success: false, error: 'uniqueId and notes are required' }, { status: 400 });
    }

    let data: any;
    try {
        data = await invokeEdgeFunction('mystifly-booking-note', { uniqueId, notes });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 502 });
    }

    if (!data.success) return NextResponse.json(data);

    if (bookingId) {
        try {
            const db = createAdminClient();
            const rows = notes.map((note: string) => ({ booking_id: bookingId, note }));
            const { error } = await db.from('flight_booking_notes').insert(rows);
            if (error) console.error('[booking-note] DB insert error:', error.message);
        } catch (err: any) {
            console.error('[booking-note] DB save failed:', err.message);
        }
    }

    return NextResponse.json(data);
}
