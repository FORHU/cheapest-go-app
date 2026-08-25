import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/server/auth';
import { createAdminClient } from '@/utils/postgres/admin';
import { getSqlAdmin } from '@/lib/db/postgres';
import { rateLimit } from '@/lib/server/rate-limit';
import { checkCsrf } from '@/lib/server/csrf';
import { buildHotelConfirmationEmailHtml, FROM_NOREPLY } from '@/lib/server/email';
import { env } from '@/utils/env';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const shareSchema = z.object({
    email: z.string().email('Valid email required'),
});

/**
 * POST /api/trips/[id]/share
 *
 * User-initiated resend of a hotel booking confirmation to an arbitrary address.
 * Deliberately bypasses sendBookingConfirmationEmail's dedup guard (that guard exists to
 * stop the *automatic* post-booking send from firing twice, not to block an explicit
 * "resend this to my travel companion" action) and doesn't touch booking_emails/email_logs.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const csrfError = checkCsrf(req);
    if (csrfError) return csrfError;

    const { user, error: authError } = await getAuthenticatedUser();
    if (authError || !user) {
        return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    // 5 resends per minute per user — generous for legitimate use, tight enough to block spam relay
    const rl = await rateLimit(req, { limit: 5, windowMs: 60_000, prefix: 'trip-share', userId: user.id });
    if (!rl.success) {
        return NextResponse.json({ success: false, error: 'Too many requests. Please wait before trying again.' }, { status: 429 });
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const parsed = shareSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
    }

    const db = createAdminClient();
    const { data: booking } = await db
        .from('bookings')
        .select(`
            booking_id, property_name, property_image, provider_metadata, room_name,
            check_in, check_out, guests_adults, guests_children,
            total_price, currency, holder_first_name, holder_last_name,
            cancellation_policy
        `)
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

    if (!booking) {
        return NextResponse.json({ success: false, error: 'Booking not found' }, { status: 404 });
    }

    // Best-effort enrichment from hotel_content — same as the original confirmation email.
    let propertyAddress: string | undefined;
    let propertyCity: string | undefined;
    let propertyCountry: string | undefined;
    let starRating: number | undefined;
    let reviewRating: number | undefined;
    let reviewCount: number | undefined;
    let checkInTime: string | undefined;
    let checkOutTime: string | undefined;
    try {
        const hotelCode = (booking.provider_metadata as any)?.hotelCode;
        if (hotelCode) {
            const sql = getSqlAdmin();
            const rows = await sql`
                SELECT address, city, country, star_rating, review_rating, review_count, check_in_time, check_out_time
                FROM hotel_content
                WHERE hotel_id = ${hotelCode}
                LIMIT 1
            `;
            if (rows[0]) {
                propertyAddress = rows[0].address ?? undefined;
                propertyCity = rows[0].city ?? undefined;
                propertyCountry = rows[0].country ?? undefined;
                starRating = rows[0].star_rating ?? undefined;
                reviewRating = rows[0].review_rating ?? undefined;
                reviewCount = rows[0].review_count ?? undefined;
                checkInTime = rows[0].check_in_time ?? undefined;
                checkOutTime = rows[0].check_out_time ?? undefined;
            }
        }
    } catch { /* non-fatal — email omits property details */ }

    const html = buildHotelConfirmationEmailHtml({
        bookingId: booking.booking_id,
        dbId: id,
        email: parsed.data.email,
        guestName: `${booking.holder_first_name || ''} ${booking.holder_last_name || ''}`.trim(),
        hotelName: booking.property_name || '',
        propertyImage: booking.property_image ?? undefined,
        propertyAddress,
        propertyCity,
        propertyCountry,
        starRating,
        reviewRating,
        reviewCount,
        checkInTime,
        checkOutTime,
        roomName: booking.room_name || '',
        checkIn: booking.check_in || '',
        checkOut: booking.check_out || '',
        totalPrice: booking.total_price || 0,
        currency: booking.currency || 'PHP',
        adults: booking.guests_adults ?? undefined,
        children: booking.guests_children ?? undefined,
        cancellationPolicy: (booking.cancellation_policy as any) ?? undefined,
    });

    const resendApiKey = env.RESEND_API_KEY;
    if (!resendApiKey) {
        return NextResponse.json({ success: false, error: 'Email sending is not configured' }, { status: 503 });
    }

    try {
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                from: FROM_NOREPLY,
                to: [parsed.data.email],
                subject: `Booking Confirmation - ${booking.property_name}`,
                html,
            }),
        });
        if (!res.ok) {
            const text = await res.text();
            console.error('[trips/share] Resend failed:', text);
            return NextResponse.json({ success: false, error: 'Failed to send email' }, { status: 502 });
        }
        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('[trips/share] Error:', err);
        return NextResponse.json({ success: false, error: 'Failed to send email' }, { status: 500 });
    }
}
