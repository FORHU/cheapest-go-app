import { NextResponse } from 'next/server';
import {
    getBookingRawData,
    adminForceStatusRecheck,
    adminCancelBooking,
    adminForceRefund,
    adminRestoreBooking,
} from '@/lib/server/admin';
import { createClient } from '@/utils/supabase/server';

export async function POST(req: Request) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single();

        if (profile?.role !== 'admin') {
            return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
        }

        const body = await req.json();
        const { action, bookingId } = body;

        switch (action) {
            case 'raw':
                const rawResult = await getBookingRawData(bookingId);
                return NextResponse.json(rawResult);
            case 'recheck':
                const recheckResult = await adminForceStatusRecheck(bookingId);
                return NextResponse.json(recheckResult);
            case 'cancel':
                const cancelResult = await adminCancelBooking(bookingId);
                return NextResponse.json(cancelResult);
            case 'refund':
                const refundResult = await adminForceRefund(bookingId);
                return NextResponse.json(refundResult);
            case 'restore':
                const restoreResult = await adminRestoreBooking(bookingId);
                return NextResponse.json(restoreResult);
            default:
                return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
        }
    } catch (e: any) {
        console.error('[Admin Bookings API] Error:', e);
        return NextResponse.json({ success: false, error: e.message || 'Internal Server Error' }, { status: 500 });
    }
}
