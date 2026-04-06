import { createAdminClient } from '@/utils/supabase/admin';
import { 
    sendBookingConfirmationEmail, 
    sendFlightBookingConfirmationEmail,
    sendFlightAwaitingTicketEmail,
    sendFlightRefundEmail,
    sendFlightCancellationEmail,
    sendFlightCancellationRefundEmail
} from '@/lib/server/email';

export interface EmailLog {
    id: string;
    booking_id: string;
    recipient: string;
    subject: string;
    email_type: 'confirmation' | 'ticketed' | 'refund' | 'cancellation' | 'awaiting_ticket';
    status: 'queued' | 'sent' | 'failed';
    error_message?: string;
    metadata: any;
    created_at: string;
    sent_at: string | null;
}

export interface GetEmailLogsParams {
    page?: number;
    pageSize?: number;
    bookingId?: string;
    status?: string;
    type?: string;
}

export async function getEmailLogs(params: GetEmailLogsParams = {}) {
    const { page = 1, pageSize = 20, bookingId, status, type } = params;
    const supabase = createAdminClient();

    let query = supabase
        .from('email_logs')
        .select('*', { count: 'exact' });

    if (bookingId) query = query.eq('booking_id', bookingId);
    if (status && status !== 'all') query = query.eq('status', status);
    if (type && type !== 'all') query = query.eq('email_type', type);

    const { data, count, error } = await query
        .order('created_at', { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1);

    if (error) throw error;

    return {
        logs: (data || []) as EmailLog[],
        total: count || 0,
        page,
        pageSize,
        totalPages: Math.ceil((count || 0) / pageSize)
    };
}

export async function retryEmailLog(logId: string) {
    const supabase = createAdminClient();

    // 1. Fetch the log
    const { data: log, error: logError } = await supabase
        .from('email_logs')
        .select('*')
        .eq('id', logId)
        .single();

    if (logError || !log) throw new Error('Email log not found');

    const bookingId = log.booking_id;
    const emailType = log.email_type;

    // 2. Fetch booking details to get the data needed for the email
    // This is complex because bookings can be in unified_bookings, flight_bookings, or bookings.
    // We'll try unified_bookings first as it's the newer system.
    
    const { data: unifiedBooking } = await supabase
        .from('unified_bookings')
        .select('*')
        .eq('id', bookingId)
        .single();

    if (unifiedBooking) {
        // Retry based on email type
        const meta = unifiedBooking.metadata as any;
        const email = log.recipient;

        if (unifiedBooking.type === 'hotel') {
            if (emailType === 'confirmation') {
                return await sendBookingConfirmationEmail({
                    bookingId: unifiedBooking.id,
                    email,
                    guestName: meta?.holder?.firstName || 'Guest',
                    hotelName: meta?.hotelName || 'Hotel',
                    roomName: meta?.roomName || 'Room',
                    checkIn: meta?.checkIn || '',
                    checkOut: meta?.checkOut || '',
                    totalPrice: Number(unifiedBooking.total_price),
                    currency: unifiedBooking.currency
                });
            }
        } else if (unifiedBooking.type === 'flight') {
            const passengers = meta?.passengers || [];
            const passengerName = passengers[0] ? `${passengers[0].firstName} ${passengers[0].lastName}` : 'Passenger';
            const segments = meta?.segments || [];
            const pnr = meta?.pnr || unifiedBooking.external_id || '';

            if (emailType === 'confirmation' || emailType === 'ticketed') {
                return await sendFlightBookingConfirmationEmail({
                    bookingId: unifiedBooking.id,
                    pnr,
                    email,
                    passengerName,
                    segments,
                    totalPrice: Number(unifiedBooking.total_price),
                    currency: unifiedBooking.currency,
                    provider: unifiedBooking.provider
                });
            } else if (emailType === 'awaiting_ticket') {
                return await sendFlightAwaitingTicketEmail({
                    bookingId: unifiedBooking.id,
                    pnr,
                    email,
                    passengerName,
                    segments,
                    totalPrice: Number(unifiedBooking.total_price),
                    currency: unifiedBooking.currency
                });
            }
            // Add other types as needed
        }
    }

    // If not found in unified, it might be legacy (omitting for now unless needed)
    throw new Error(`Retry not implemented for this booking type or email type: ${emailType}`);
}
