import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/server/auth';
import { stripe } from '@/lib/stripe/server';
import { rateLimit } from '@/lib/server/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    // 5 payment initiations per minute per IP
    const rl = rateLimit(req, { limit: 5, windowMs: 60_000, prefix: 'hotel-payment' });
    if (!rl.success) {
        return NextResponse.json({ success: false, error: 'Too many requests. Please wait before trying again.' }, { status: 429 });
    }

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

        // Zero-decimal currencies must NOT be multiplied by 100.
        // See: https://stripe.com/docs/currencies#zero-decimal
        const ZERO_DECIMAL_CURRENCIES = new Set([
            'bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga',
            'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf',
        ]);
        const isZeroDecimal = ZERO_DECIMAL_CURRENCIES.has(currency.toLowerCase());
        const stripeAmount = isZeroDecimal ? Math.round(amount) : Math.round(amount * 100);

        // Create Stripe PaymentIntent (automatic capture — refund on LiteAPI failure)
        const paymentIntent = await stripe.paymentIntents.create({
            amount: stripeAmount,
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
