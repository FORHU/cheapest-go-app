import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/server/auth';
import { stripe } from '@/lib/stripe/server';
import { rateLimit } from '@/lib/server/rate-limit';
import { applyMarkup, toStripeAmount, HOTEL_MARKUP, BUNDLE_MARKUP } from '@/lib/pricing';

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
        const { prebookId, amount, currency, holderEmail, propertyName, roomName, bundleFlightId } = body as {
            prebookId: string;
            amount: number;
            currency: string;
            holderEmail: string;
            propertyName?: string;
            roomName?: string;
            /** If set, user is bundling this hotel with a completed flight booking → 12% bundle rate applies instead of 15% standalone */
            bundleFlightId?: string;
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

        // Apply platform markup — bundle rate (12%) when paired with a flight, standalone rate (15%) otherwise.
        // See src/lib/pricing.ts for full strategy documentation.
        const markupRate = bundleFlightId ? BUNDLE_MARKUP : HOTEL_MARKUP;
        const pricing = applyMarkup(amount, markupRate);
        const stripeAmount = toStripeAmount(pricing.chargedPrice, currency);

        console.log(`[create-payment] Hotel pricing: original=${pricing.originalPrice} ${currency}, charged=${pricing.chargedPrice}, markup=${(markupRate * 100).toFixed(0)}%${bundleFlightId ? ' (bundle)' : ' (standalone)'}`);

        // Create Stripe PaymentIntent (automatic capture — refund on LiteAPI failure)
        const paymentIntent = await stripe.paymentIntents.create({
            amount: stripeAmount,
            currency: currency.toLowerCase(),
            capture_method: 'automatic',
            metadata: {
                prebookId,
                userId: user.id,
                holderEmail: holderEmail || '',
                type: bundleFlightId ? 'hotel_bundle' : 'hotel',
                bundleFlightId: bundleFlightId || '',
                originalPrice: String(pricing.originalPrice),
                markupRate: String(markupRate),
                markupAmount: String(pricing.markupAmount),
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
