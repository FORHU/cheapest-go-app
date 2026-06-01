import { createAdminClient } from '@/utils/postgres/admin';
import { NextRequest } from 'next/server';
import { getAuthenticatedUser } from '@/lib/server/auth';
import { confirmAndSaveTgxBooking } from '@/lib/server/bookings';
import { stripe } from '@/lib/stripe/server';
import { createNotification } from '@/lib/server/admin/notify';

export const maxDuration = 120;
import { sendBookingConfirmationEmail } from '@/lib/server/email';
import { revalidatePath } from 'next/cache';
import { rateLimit } from '@/lib/server/rate-limit';
import { safeError } from '@/lib/server/safe-error';
import { checkCsrf } from '@/lib/server/csrf';
import { bookingConfirmSchema } from '@/lib/schemas/booking';
import { env } from '@/utils/env';

export const dynamic = 'force-dynamic';


export async function POST(req: NextRequest) {
    const csrfError = checkCsrf(req);
    if (csrfError) return csrfError;

    // Auth first so rate limit keys on user ID instead of IP (IP is spoofable)
    const { user, error: authError } = await getAuthenticatedUser();
    if (authError || !user) {
        return Response.json(
            { success: false, error: 'Authentication required' },
            { status: 401 }
        );
    }

    // 5 booking confirmations per minute per user
    const rl = await rateLimit(req, { limit: 5, windowMs: 60_000, prefix: 'hotel-confirm', userId: user.id });
    if (!rl.success) {
        return Response.json({ success: false, error: 'Too many requests. Please wait before trying again.' }, { status: 429 });
    }

    try {

        const body = await req.json();
        const parsed = bookingConfirmSchema.safeParse(body);
        if (!parsed.success) {
            return Response.json(
                { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid request' },
                { status: 400 }
            );
        }

        // ── Stripe payment verification (when paymentIntentId is present) ──
        if (body.paymentIntentId) {
            const pi = await stripe.paymentIntents.retrieve(body.paymentIntentId);

            if (pi.status !== 'succeeded') {
                return Response.json(
                    { success: false, error: `Payment not completed (status: ${pi.status})` },
                    { status: 400 }
                );
            }

            // Security: verify the payment belongs to this user
            if (pi.metadata?.userId !== user.id) {
                return Response.json(
                    { success: false, error: 'Payment does not belong to this user' },
                    { status: 403 }
                );
            }

            // Idempotency: if a booking already exists for this PaymentIntent, return it.
            // This handles the case where confirm succeeded but the client retried (network error,
            // double-click that bypassed the UI guard, etc.).
            const svc = createAdminClient();
            const { data: existingBooking } = await svc
                .from('bookings')
                .select('booking_id, status, total_price, currency')
                .eq('payment_intent_id', body.paymentIntentId)
                .maybeSingle();

            if (existingBooking) {
                console.log(`[confirm] Idempotent return — booking already exists for PI ${body.paymentIntentId}: ${existingBooking.booking_id}`);
                return Response.json({
                    success: true,
                    data: {
                        bookingId: existingBooking.booking_id,
                        status: existingBooking.status,
                        policyType: 'standard',
                        policySummary: '',
                        totalPrice: existingBooking.total_price,
                        currency: existingBooking.currency,
                    },
                });
            }
        }

        // TravelgateX path: prebookId is encoded as "TGX:{quoteToken}"
        const quoteToken = String(body.prebookId).startsWith('TGX:')
            ? String(body.prebookId).slice(4)
            : String(body.prebookId);

        const result = await confirmAndSaveTgxBooking({
            quoteToken,
            holder: body.holder,
            guests: body.guests || [],
            propertyName: body.propertyName || '',
            propertyImage: body.propertyImage,
            roomName: body.roomName || body.holder?.firstName || 'Standard Room',
            checkIn: body.checkIn || '',
            checkOut: body.checkOut || '',
            adults: body.adults || 2,
            children: body.children || 0,
            currency: body.currency || 'USD',
            specialRequests: body.specialRequests,
            paymentIntentId: body.paymentIntentId,
            voucherCode: body.voucherCode,
            discountAmount: body.discountAmount,
        }, user);

        if (result.success) {
            revalidatePath('/trips');
            createNotification(
                'Hotel Booking Confirmed',
                `Booking ${result.data?.bookingId || ''} confirmed for ${user.email}.`,
                'booking'
            );
            sendBookingConfirmationEmail({
                bookingId: result.data?.bookingId || '',
                email: body.holder?.email || user.email || '',
                guestName: `${body.holder?.firstName || ''} ${body.holder?.lastName || ''}`.trim(),
                hotelName: body.propertyName || '',
                roomName: body.roomName || '',
                checkIn: body.checkIn || '',
                checkOut: body.checkOut || '',
                totalPrice: result.data?.totalPrice || 0,
                currency: result.data?.currency || body.currency || 'USD',
            }).catch(e => console.error('[confirm] Email failed:', e));
            return Response.json(result);
        }

        // Booking failed — refund Stripe payment if captured
        if (!result.providerConfirmed && body.paymentIntentId) {
            try {
                const refund = await stripe.refunds.create({ payment_intent: body.paymentIntentId });
                console.log(`[confirm] Auto-refunded ${refund.id} for failed booking`);
                return Response.json({
                    success: false,
                    error: (result.error || 'Booking failed') + '. Your payment has been automatically refunded.',
                });
            } catch (refundErr: any) {
                console.error('[confirm] Refund failed:', refundErr.message);
                return Response.json({
                    success: false,
                    error: (result.error || 'Booking failed') + '. Please contact support for a refund.',
                });
            }
        }

        // DB save failed after booking confirmed — do NOT refund
        if (result.providerConfirmed) {
            createNotification(
                'CRITICAL: DB Save Failed After Booking Confirm',
                `Booking ${result.data?.bookingId || 'unknown'} confirmed for ${user.email} but DB save failed. Manual reconciliation required. PaymentIntent: ${body.paymentIntentId || 'N/A'}`,
                'booking'
            );
            return Response.json({
                success: false,
                error: result.error,
                data: result.data,
            }, { status: 500 });
        }

        return Response.json(result);
    } catch (err) {
        return Response.json(
            { success: false, error: safeError(err, 'booking/confirm') },
            { status: 500 }
        );
    }
}
