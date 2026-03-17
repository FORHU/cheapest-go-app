import { NextResponse } from 'next/server';
import {
    requireAdmin,
    isAuthError,
    getBookingRawData,
    adminForceStatusRecheck,
    adminCancelBooking,
    adminForceRefund,
    adminRestoreBooking,
    getMonitoringData,
    adminRetryBooking,
    adminCancelAwaitingTicket
} from '@/lib/server/admin';

export async function POST(req: Request) {
    try {
        const auth = await requireAdmin();
        if (isAuthError(auth)) return auth;

        const body = await req.json();
        const { action, bookingId, reason } = body;

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
                const refundResult = await adminForceRefund(bookingId, reason);
                return NextResponse.json(refundResult);
            case 'refund_history':
                const historyRes = await auth.supabase
                    .from('refund_logs')
                    .select('*')
                    .or(`booking_id.eq.${bookingId},booking_id.eq.${bookingId.slice(0, 8).toUpperCase()}`)
                    .order('requested_at', { ascending: false });
                return NextResponse.json({ success: true, data: historyRes.data || [] });
            case 'restore':
                const restoreResult = await adminRestoreBooking(bookingId);
                return NextResponse.json(restoreResult);
            case 'monitoring':
                const monitorData = await getMonitoringData();
                return NextResponse.json({ success: true, data: monitorData });
            case 'retry_booking':
                const retryResult = await adminRetryBooking(bookingId);
                return NextResponse.json(retryResult);
            case 'cancel_awaiting_ticket':
                const cancelAwaitingResult = await adminCancelAwaitingTicket(bookingId);
                return NextResponse.json(cancelAwaitingResult);
            default:
                return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
        }
    } catch (e: any) {
        console.error('[Admin Bookings API] Error:', e);
        return NextResponse.json({ success: false, error: e.message || 'Internal Server Error' }, { status: 500 });
    }
}
