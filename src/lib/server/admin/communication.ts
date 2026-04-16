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
    } else {
        // ─── Fallback for Legacy Bookings ───

        // Try Legacy Flight Bookings
        const { data: flight } = await supabase
            .from('flight_bookings')
            .select('*, flight_segments(*), passengers(*)')
            .eq('id', bookingId)
            .single();

        if (flight) {
            const passengers = flight.passengers || [];
            const passengerName = passengers[0] ? `${passengers[0].first_name} ${passengers[0].last_name}` : 'Passenger';
            const email = log.recipient;

            if (emailType === 'confirmation' || emailType === 'ticketed') {
                return await sendFlightBookingConfirmationEmail({
                    bookingId: flight.id,
                    pnr: flight.pnr || '',
                    email,
                    passengerName,
                    segments: flight.flight_segments?.map((s: any) => ({
                        airline: s.airline || '',
                        airlineName: s.airline_name || s.airline || '',
                        flightNumber: s.flight_number || '',
                        origin: s.origin || '',
                        destination: s.destination || '',
                        departureTime: s.departure || '',
                        arrivalTime: s.arrival || ''
                    })) || [],
                    totalPrice: Number(flight.total_price),
                    currency: flight.currency || 'USD',
                    provider: flight.provider || 'Mystifly'
                });
            } else if (emailType === 'awaiting_ticket') {
                return await sendFlightAwaitingTicketEmail({
                    bookingId: flight.id,
                    pnr: flight.pnr || '',
                    email,
                    passengerName,
                    segments: flight.flight_segments?.map((s: any) => ({
                        airline: s.airline || '',
                        airlineName: s.airline_name || s.airline || '',
                        flightNumber: s.flight_number || '',
                        origin: s.origin || '',
                        destination: s.destination || '',
                        departureTime: s.departure || '',
                        arrivalTime: s.arrival || ''
                    })) || [],
                    totalPrice: Number(flight.total_price),
                    currency: flight.currency || 'USD'
                });
            }
        }

        // Try Legacy Hotel Bookings
        const { data: hotel } = await supabase
            .from('bookings')
            .select('*')
            .eq('id', bookingId)
            .single();

        if (hotel) {
            const email = log.recipient;
            if (emailType === 'confirmation') {
                return await sendBookingConfirmationEmail({
                    bookingId: hotel.internal_id || hotel.booking_id || hotel.id,
                    dbId: hotel.id,
                    email,
                    guestName: `${hotel.holder_first_name} ${hotel.holder_last_name}`,
                    hotelName: hotel.property_name || 'Hotel',
                    roomName: hotel.room_name || 'Room',
                    checkIn: hotel.check_in,
                    checkOut: hotel.check_out,
                    totalPrice: Number(hotel.total_price),
                    currency: hotel.currency || 'PHP'
                });
            }
        }
    }

    throw new Error(`Retry not implemented for this booking type or email type: ${emailType}`);
}

/**
 * Resends the confirmation email for a given booking ID.
 * This can be used to re-trigger the initial success email with the receipt link.
 */
export async function resendBookingEmail(bookingId: string) {
    const supabase = createAdminClient();

    // 1. Fetch booking data - try unified_bookings first
    const { data: unified, error: fetchErr } = await supabase
        .from('unified_bookings')
        .select('*')
        .eq('id', bookingId)
        .single();

    if (fetchErr || !unified) {
        // Fallback to legacy flight bookings
        const { data: flight, error: flightErr } = await supabase
            .from('flight_bookings')
            .select('*, flight_segments(*), passengers(*)')
            .eq('id', bookingId)
            .single();

        if (flight && !flightErr) {
            const passengers = flight.passengers || [];
            const passengerName = passengers[0] ? `${passengers[0].first_name} ${passengers[0].last_name}` : 'Passenger';
            
            // Resolve email from profile if not in booking (admins viewing might need this)
            let email = flight.email || flight.contact_email;
            if (!email && flight.user_id) {
                const { data: profile } = await supabase.from('profiles').select('email').eq('id', flight.user_id).single();
                if (profile?.email) email = profile.email;
            }

            if (!email) throw new Error('Customer email not found for this booking');

            return await sendFlightBookingConfirmationEmail({
                bookingId: flight.id,
                pnr: flight.pnr || '',
                email,
                passengerName,
                segments: flight.flight_segments?.map((s: any) => ({
                    airline: s.airline || '',
                    airlineName: s.airline_name || s.airline || '',
                    flightNumber: s.flight_number || '',
                    origin: s.origin || '',
                    destination: s.destination || '',
                    departureTime: s.departure || '',
                    arrivalTime: s.arrival || ''
                })) || [],
                totalPrice: Number(flight.total_price),
                currency: flight.currency || 'USD',
                provider: flight.provider || 'Mystifly'
            });
        }

        // Fallback to legacy hotel bookings
        const { data: hotel, error: hotelErr } = await supabase
            .from('bookings')
            .select('*')
            .eq('id', bookingId)
            .single();

        if (hotel && !hotelErr) {
            return await sendBookingConfirmationEmail({
                bookingId: hotel.internal_id || hotel.booking_id || hotel.id,
                dbId: hotel.id,
                email: hotel.holder_email,
                guestName: `${hotel.holder_first_name} ${hotel.holder_last_name}`,
                hotelName: hotel.property_name || 'Hotel',
                roomName: hotel.room_name || 'Room',
                checkIn: hotel.check_in,
                checkOut: hotel.check_out,
                totalPrice: Number(hotel.total_price),
                currency: hotel.currency || 'PHP'
            });
        }

        throw new Error('Booking not found in any system');
    }

    // Handle Unified Booking
    const meta = unified.metadata as any;
    
    // Resolve email
    let targetEmail = meta?.holder?.email || meta?.contactEmail || meta?.email;
    if (!targetEmail && unified.user_id) {
        const { data: profile } = await supabase.from('profiles').select('email').eq('id', unified.user_id).single();
        if (profile?.email) targetEmail = profile.email;
    }

    if (!targetEmail) throw new Error('Customer email not found for this booking');

    if (unified.type === 'hotel') {
        return await sendBookingConfirmationEmail({
            bookingId: unified.external_id || unified.id,
            dbId: unified.id,
            email: targetEmail,
            guestName: `${meta?.holder?.firstName || 'Guest'} ${meta?.holder?.lastName || ''}`.trim(),
            hotelName: meta?.property_name || meta?.hotelName || 'Hotel',
            roomName: meta?.room_name || meta?.roomName || 'Room',
            checkIn: meta?.checkIn || meta?.check_in || '',
            checkOut: meta?.checkOut || meta?.check_out || '',
            totalPrice: Number(unified.total_price),
            currency: unified.currency
        });
    } else {
        // Flight or Other
        const passengers = meta?.passengers || [];
        const passengerName = passengers[0] ? `${passengers[0].firstName || passengers[0].first_name} ${passengers[0].lastName || passengers[0].last_name}` : 'Passenger';
        
        return await sendFlightBookingConfirmationEmail({
            bookingId: unified.id,
            pnr: meta?.pnr || unified.external_id || '',
            email: targetEmail,
            passengerName,
            segments: (meta?.segments || meta?.flight_segments || []).map((s: any) => ({
                airline: s.airline || '',
                airlineName: s.airlineName || s.airline_name || s.airline || '',
                flightNumber: s.flightNumber || s.flight_number || '',
                origin: s.origin || '',
                destination: s.destination || '',
                departureTime: s.departureTime || s.departure || '',
                arrivalTime: s.arrivalTime || s.arrival || ''
            })),
            totalPrice: Number(unified.total_price),
            currency: unified.currency,
            provider: unified.provider
        });
    }
}
