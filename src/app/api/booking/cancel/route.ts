import { getAuthenticatedUser } from '@/lib/server/auth';
import { cancelBooking } from '@/lib/server/bookings';
import { createNotification } from '@/lib/server/admin/notify';
import { sendHotelCancellationEmail } from '@/lib/server/email';
import { getSqlAdmin } from '@/lib/db/postgres';
import { revalidatePath } from 'next/cache';

export const maxDuration = 60;
import { cancelBookingSchema } from '@/lib/schemas/booking';
import { createAdminClient } from '@/utils/postgres/admin';
import { env } from '@/utils/env';

export const dynamic = 'force-dynamic';


export async function POST(req: Request) {
    try {
        const { user, error: authError } = await getAuthenticatedUser();
        const supabase = createAdminClient();
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

        // Service-role client bypasses RLS for refund_logs and bookings writes.
        // We still use the user-scoped client (supabase) only for ownership reads below.
        const serviceClient = createAdminClient();
        const data = await cancelBooking(bookingId, user, serviceClient);

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
                .select('id, property_name, property_image, provider_metadata, room_name, check_in, check_out, holder_email, holder_first_name, holder_last_name, total_price, currency')
                .eq('booking_id', bookingId)
                .single();

            if (booking) {
                const refundData = data.data?.refund;

                // Best-effort enrichment from hotel_content — city/rating for the property panel.
                // Non-fatal: the email just omits those lines if the lookup fails or hotelCode is unknown.
                let propertyCity: string | undefined;
                let propertyCountry: string | undefined;
                let starRating: number | undefined;
                let reviewRating: number | undefined;
                let reviewCount: number | undefined;
                try {
                    const hotelCode = (booking.provider_metadata as any)?.hotelCode;
                    if (hotelCode) {
                        const sql = getSqlAdmin();
                        const rows = await sql`
                            SELECT city, country, star_rating, review_rating, review_count
                            FROM hotel_content
                            WHERE hotel_id = ${hotelCode}
                            LIMIT 1
                        `;
                        if (rows[0]) {
                            propertyCity = rows[0].city ?? undefined;
                            propertyCountry = rows[0].country ?? undefined;
                            starRating = rows[0].star_rating ?? undefined;
                            reviewRating = rows[0].review_rating ?? undefined;
                            reviewCount = rows[0].review_count ?? undefined;
                        }
                    }
                } catch { /* non-fatal — email omits property details */ }

                sendHotelCancellationEmail({
                    bookingId,
                    dbId: booking.id,
                    email: booking.holder_email || user.email || '',
                    guestName: `${booking.holder_first_name || ''} ${booking.holder_last_name || ''}`.trim(),
                    hotelName: booking.property_name || '',
                    propertyImage: booking.property_image ?? undefined,
                    propertyCity,
                    propertyCountry,
                    starRating,
                    reviewRating,
                    reviewCount,
                    roomName: booking.room_name || '',
                    checkIn: booking.check_in || '',
                    checkOut: booking.check_out || '',
                    totalPrice: booking.total_price ?? undefined,
                    refundAmount: refundData?.amount,
                    penaltyAmount: refundData?.penaltyAmount,
                    currency: refundData?.currency || booking.currency || undefined,
                    refundStatus: refundData?.status || (data.data?.status?.includes('refund') ? 'pending' : 'non_refundable'),
                    cancellationRef: refundData?.id,
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
