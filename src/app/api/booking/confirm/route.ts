import { getAuthenticatedUser } from '@/lib/server/auth';
import { confirmAndSaveBooking } from '@/lib/server/bookings';
import { stripe } from '@/lib/stripe/server';
import { createNotification } from '@/lib/server/admin/notify';
import { sendBookingConfirmationEmail } from '@/lib/server/email';
import { revalidatePath } from 'next/cache';
import { rateLimit } from '@/lib/server/rate-limit';
import { safeError } from '@/lib/server/safe-error';
import { bookingConfirmSchema } from '@/lib/schemas/booking';

export const dynamic = 'force-dynamic';


export async function POST(req: Request) {
    // 5 booking confirmations per minute per IP
    const rl = rateLimit(req, { limit: 5, windowMs: 60_000, prefix: 'hotel-confirm' });
    if (!rl.success) {
        return Response.json({ success: false, error: 'Too many requests. Please wait before trying again.' }, { status: 429 });
    }

    try {
        const { user, error: authError } = await getAuthenticatedUser();
        if (authError || !user) {
            return Response.json(
                { success: false, error: 'Authentication required' },
                { status: 401 }
            );
        }

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
            if (pi.metadata.userId !== user.id) {
                return Response.json(
                    { success: false, error: 'Payment does not belong to this user' },
                    { status: 403 }
                );
            }
        }

        // Unified flow: LiteAPI confirm → normalize policy → atomic DB save
        const result = await confirmAndSaveBooking(body, user);

        if (result.success) {
            revalidatePath('/trips');
            createNotification(
                'Hotel Booking Confirmed',
                `Booking ${result.data?.bookingId || ''} confirmed for ${user.email}.`,
                'booking'
            );

            // Send confirmation email to guest (fire-and-forget, non-blocking)
            sendBookingConfirmationEmail({
                bookingId: result.data?.bookingId || '',
                email: body.holder?.email || user.email || '',
                guestName: `${body.holder?.firstName || ''} ${body.holder?.lastName || ''}`.trim(),
                hotelName: body.propertyName || '',
                roomName: body.roomName || '',
                checkIn: body.checkIn || '',
                checkOut: body.checkOut || '',
                totalPrice: result.data?.totalPrice || 0,
                currency: result.data?.currency || body.currency || 'PHP',
            }).catch(e => console.error('[confirm] Email error:', e));

            // Structured financial event log for hotel payment
            if (body.paymentIntentId) {
                console.log(JSON.stringify({
                    _event: 'financial',
                    type: 'payment',
                    bookingType: 'hotel',
                    bookingId: result.data?.bookingId,
                    paymentIntentId: body.paymentIntentId,
                    amount: result.data?.totalPrice || 0,
                    currency: result.data?.currency || body.currency || 'PHP',
                    userId: user.id.slice(0, 8),
                    timestamp: new Date().toISOString(),
                }));
            }

            return Response.json(result);
        }

        // ── DB save failed AFTER LiteAPI confirmed the booking ──
        // The hotel IS booked — do NOT refund Stripe. Alert admin instead.
        if (result.liteApiConfirmed) {
            createNotification(
                'CRITICAL: DB Save Failed After LiteAPI Confirm',
                `Booking ${result.data?.bookingId || 'unknown'} confirmed in LiteAPI for ${user.email} but DB save failed. Manual reconciliation required. PaymentIntent: ${body.paymentIntentId || 'N/A'}`,
                'booking'
            );
            return Response.json({
                success: false,
                error: result.error,
                data: result.data,
            }, { status: 500 });
        }

        // ── LiteAPI failed — refund Stripe payment if it was charged ──
        if (body.paymentIntentId) {
            let refundSuccess = false;
            try {
                const refund = await stripe.refunds.create({ payment_intent: body.paymentIntentId });
                refundSuccess = true;
                // Structured financial event log (hotel bookings can't use booking_financial_events FK yet)
                console.log(JSON.stringify({
                    _event: 'financial',
                    type: 'refund',
                    bookingType: 'hotel',
                    paymentIntentId: body.paymentIntentId,
                    refundId: refund.id,
                    amount: refund.amount / 100,
                    currency: (refund.currency || 'usd').toUpperCase(),
                    reason: 'liteapi_failure',
                    userId: user.id.slice(0, 8),
                    timestamp: new Date().toISOString(),
                }));
            } catch (refundErr: any) {
                console.error('[confirm] Failed to refund:', refundErr.message);
            }
            return Response.json({
                success: false,
                error: (result.error || 'Booking failed') + (refundSuccess ? '. Your payment has been automatically refunded.' : '. Please contact support for a refund.'),
            });
        }

        return Response.json(result);
    } catch (err) {
        return Response.json(
            { success: false, error: safeError(err, 'booking/confirm') },
            { status: 500 }
        );
    }
}
