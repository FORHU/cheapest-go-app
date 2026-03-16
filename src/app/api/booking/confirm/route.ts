import { getAuthenticatedUser } from '@/lib/server/auth';
import { confirmAndSaveBooking } from '@/lib/server/bookings';
import { stripe } from '@/lib/stripe/server';
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
            return Response.json(result);
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
