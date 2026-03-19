import { getAuthenticatedUser } from '@/lib/server/auth';
import { amendBooking } from '@/lib/server/bookings';
import { createNotification } from '@/lib/server/admin/notify';
import { sendHotelAmendmentEmail } from '@/lib/server/email';
import { revalidatePath } from 'next/cache';

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
        const data = await amendBooking(body, user, supabase);

        // Revalidate trips page after amendment
        if (data.success) {
            revalidatePath('/trips');
            createNotification(
                'Booking Amended',
                `Booking amended by ${user.email}.`,
                'booking'
            );

            // Send amendment email to guest (fire-and-forget)
            const { data: booking } = await supabase
                .from('bookings')
                .select('property_name')
                .eq('booking_id', body.bookingId)
                .single();

            const changes = [
                body.firstName || body.lastName ? 'Guest name' : '',
                body.email ? 'Email' : '',
                body.remarks ? 'Special requests' : '',
            ].filter(Boolean).join(', ') || 'Booking details';

            sendHotelAmendmentEmail({
                bookingId: body.bookingId,
                email: body.email || user.email || '',
                guestName: `${body.firstName || ''} ${body.lastName || ''}`.trim(),
                hotelName: booking?.property_name || '',
                changes,
            }).catch(e => console.error('[amend] Email error:', e));
        }

        return Response.json(data);
    } catch (err) {
        return Response.json(
            { success: false, error: String(err) },
            { status: 500 }
        );
    }
}
