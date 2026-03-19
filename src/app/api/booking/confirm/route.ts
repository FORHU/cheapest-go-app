import { getAuthenticatedUser } from '@/lib/server/auth';
import { confirmAndSaveBooking } from '@/lib/server/bookings';
import { stripe } from '@/lib/stripe/server';
import { createNotification } from '@/lib/server/admin/notify';
import { sendBookingConfirmationEmail } from '@/lib/server/email';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';


export async function POST(req: Request) {
    try {
        const { user, error: authError } = await getAuthenticatedUser();
        if (authError || !user) {
            return Response.json(
                { success: false, error: 'Authentication required' },
                { status: 401 }
            );
        }

        const body = await req.json();

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
            try {
                await stripe.refunds.create({ payment_intent: body.paymentIntentId });
                console.log('[confirm] Refunded Stripe payment after LiteAPI failure:', body.paymentIntentId);
            } catch (refundErr: any) {
                console.error('[confirm] Failed to refund:', refundErr.message);
            }
            return Response.json({
                success: false,
                error: (result.error || 'Booking failed') + '. Your payment has been automatically refunded.',
            });
        }

        return Response.json(result);
    } catch (err) {
        return Response.json(
            { success: false, error: String(err) },
            { status: 500 }
        );
    }
}
