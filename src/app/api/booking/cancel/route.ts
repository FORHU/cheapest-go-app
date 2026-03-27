import { getAuthenticatedUser } from '@/lib/server/auth';
import { cancelBooking } from '@/lib/server/bookings';
import { createNotification } from '@/lib/server/admin/notify';
import { sendHotelCancellationEmail } from '@/lib/server/email';
import { revalidatePath } from 'next/cache';
import { cancelBookingSchema } from '@/lib/schemas/booking';

export const dynamic = 'force-dynamic';


export async function POST(req: Request) {
    try {
        const { user, supabase, error: authError } = await getAuthenticatedUser();
        if (authError || !user) {
            return Response.json(
                { success: false, error: 'Authentication required' },
                { status: 401 }
            );
        }

        const body = await req.json();
        const parsed = cancelBookingSchema.safeParse(body);
        if (!parsed.success) {
            return Response.json(
                { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid request' },
                { status: 400 }
            );
        }
        const { bookingId } = parsed.data;

        const data = await cancelBooking(bookingId, user, supabase);

        // Revalidate trips page after cancellation
        if (data.success) {
            revalidatePath('/trips');
            createNotification(
                'Booking Cancelled',
                `Booking ${bookingId} cancelled by ${user.email}.`,
                'booking'
            );

            // Send cancellation email to guest (fire-and-forget)
            const { data: booking } = await supabase
                .from('bookings')
                .select('property_name, room_name, check_in, check_out, holder_email, holder_first_name, holder_last_name')
                .eq('booking_id', bookingId)
                .single();

            if (booking) {
                const refundData = data.data?.refund;
                sendHotelCancellationEmail({
                    bookingId,
                    email: booking.holder_email || user.email || '',
                    guestName: `${booking.holder_first_name || ''} ${booking.holder_last_name || ''}`.trim(),
                    hotelName: booking.property_name || '',
                    roomName: booking.room_name || '',
                    checkIn: booking.check_in || '',
                    checkOut: booking.check_out || '',
                    refundAmount: refundData?.amount,
                    currency: refundData?.currency,
                    refundStatus: refundData?.status || (data.data?.status?.includes('refund') ? 'pending' : 'non_refundable'),
                }).catch(e => console.error('[cancel] Email error:', e));

                // Structured financial event log for hotel cancellation/refund
                if (refundData?.amount && refundData.amount > 0) {
                    console.log(JSON.stringify({
                        _event: 'financial',
                        type: 'refund',
                        bookingType: 'hotel',
                        bookingId,
                        amount: refundData.amount,
                        currency: refundData.currency || 'PHP',
                        refundStatus: refundData.status || 'pending',
                        userId: user.id.slice(0, 8),
                        timestamp: new Date().toISOString(),
                    }));
                }
            }
        }

        return Response.json(data);
    } catch (err) {
        return Response.json(
            { success: false, error: String(err) },
            { status: 500 }
        );
    }
}
