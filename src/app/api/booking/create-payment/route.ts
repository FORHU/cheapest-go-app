import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/server/auth';
import { stripe } from '@/lib/stripe/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const { user, error: authError } = await getAuthenticatedUser();
        if (authError || !user) {
            return NextResponse.json(
                { success: false, error: 'Authentication required' },
                { status: 401 }
            );
        }

        const body = await req.json();
        const { prebookId, amount, currency, holderEmail, propertyName, roomName } = body as {
            prebookId: string;
            amount: number;
            currency: string;
            holderEmail: string;
            propertyName?: string;
            roomName?: string;
        };

        // Validate
        if (!prebookId) {
            return NextResponse.json({ success: false, error: 'prebookId is required' }, { status: 400 });
        }
        if (!amount || amount <= 0) {
            return NextResponse.json({ success: false, error: 'Valid amount is required' }, { status: 400 });
        }
        if (!currency) {
            return NextResponse.json({ success: false, error: 'Currency is required' }, { status: 400 });
        }

        // Create Stripe PaymentIntent (automatic capture — refund on LiteAPI failure)
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(amount * 100),
            currency: currency.toLowerCase(),
            capture_method: 'automatic',
            metadata: {
                prebookId,
                userId: user.id,
                holderEmail: holderEmail || '',
                type: 'hotel',
            },
            description: `Hotel Booking: ${propertyName || 'Hotel'} - ${roomName || 'Room'}`,
        });

        return NextResponse.json({
            success: true,
            data: {
                clientSecret: paymentIntent.client_secret,
                paymentIntentId: paymentIntent.id,
            },
        });
    } catch (err: any) {
        console.error('[create-payment] Error:', err);
        return NextResponse.json(
            { success: false, error: err.message || 'Failed to create payment' },
            { status: 500 }
        );
    }
}
