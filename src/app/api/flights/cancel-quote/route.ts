import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/postgres/admin';
import { env } from '@/utils/env';
import { checkCsrf } from '@/lib/server/csrf';
import { stripe } from '@/lib/stripe/server';

export const maxDuration = 30;

/**
 * POST /api/flights/cancel-quote
 *
 * Returns a live Duffel cancellation quote (without confirming).
 * Use this to show the user the real refund amount before they commit.
 *
 * Body: { bookingId: string }
 * Returns: { success, refundAmount, refundCurrency, penaltyAmount, cancellationId, requiresManualCancellation? }
 *
 * Mystifly has no quote API — returns { success: false, noQuote: true } so the
 * caller falls back to the stored fare_policy estimate.
 */
export async function POST(req: NextRequest) {
    const csrfError = checkCsrf(req);
    if (csrfError) return csrfError;

    const { getSession } = await import('@/lib/auth/session');
    const { user } = await getSession();
    if (!user) {
        return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const { bookingId } = await req.json();
    if (!bookingId) {
        return NextResponse.json({ success: false, error: 'bookingId is required' }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: booking, error: fetchErr } = await supabase
        .from('flight_bookings')
        .select('id, user_id, provider, provider_order_id, session_id, total_price, currency, payment_currency, charged_price, payment_intent_id')
        .eq('id', bookingId)
        .single();

    if (fetchErr || !booking) {
        return NextResponse.json({ success: false, error: 'Booking not found' }, { status: 404 });
    }

    if (booking.user_id !== user.id) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    if (booking.provider !== 'duffel') {
        // Mystifly has no quote API — caller uses stored fare_policy
        return NextResponse.json({ success: false, noQuote: true });
    }

    const duffelToken = env.DUFFEL_TOKEN;
    if (!duffelToken) {
        return NextResponse.json({ success: false, error: 'Duffel not configured' }, { status: 503 });
    }

    // Resolve Duffel order ID
    let orderId: string | undefined = booking.provider_order_id;
    if (!orderId && booking.session_id) {
        const { data: session } = await supabase
            .from('booking_sessions')
            .select('duffel_pre_order_id')
            .eq('id', booking.session_id)
            .maybeSingle();
        orderId = (session as any)?.duffel_pre_order_id ?? undefined;
    }

    if (!orderId) {
        const isSandbox = duffelToken.startsWith('duffel_test_');
        if (isSandbox) {
            // Sandbox mock — no real order, return 0-penalty estimate
            return NextResponse.json({ success: true, refundAmount: 0, refundCurrency: 'USD', penaltyAmount: 0, cancellationId: null, sandboxMock: true });
        }
        return NextResponse.json({ success: false, error: 'Duffel order ID not found' }, { status: 422 });
    }

    const DUFFEL_HEADERS = {
        'Authorization': `Bearer ${duffelToken}`,
        'Duffel-Version': 'v2',
        'Content-Type': 'application/json',
    };

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);

        // Step 0: Check available_actions
        const orderRes = await fetch(`https://api.duffel.com/air/orders/${orderId}`, {
            headers: DUFFEL_HEADERS,
            signal: controller.signal,
        });

        if (!orderRes.ok) {
            clearTimeout(timeoutId);
            if (orderRes.status === 404) {
                return NextResponse.json({ success: false, error: 'Booking not found with airline. It may have already been cancelled.' }, { status: 404 });
            }
            const err = await orderRes.json().catch(() => ({}));
            return NextResponse.json({ success: false, error: err?.errors?.[0]?.message ?? 'Failed to fetch booking from airline' }, { status: 422 });
        }

        const orderData = await orderRes.json();
        const availableActions: string[] = orderData?.data?.available_actions ?? [];

        if (!availableActions.includes('cancel')) {
            clearTimeout(timeoutId);
            return NextResponse.json({ success: false, requiresManualCancellation: true, error: 'This booking cannot be cancelled online. Please contact support.' });
        }

        // Step 1: Create cancellation quote (NOT confirmed yet)
        const quoteRes = await fetch('https://api.duffel.com/air/order_cancellations', {
            method: 'POST',
            headers: DUFFEL_HEADERS,
            body: JSON.stringify({ data: { order_id: orderId } }),
            signal: controller.signal,
        });
        clearTimeout(timeoutId);

        const quoteData = await quoteRes.json();
        if (!quoteRes.ok) {
            return NextResponse.json({ success: false, error: quoteData?.errors?.[0]?.message ?? 'Failed to get cancellation quote from airline' }, { status: 422 });
        }

        const quote = quoteData?.data ?? {};
        const duffelRefundUsd = Number(quote.refund_amount) || 0;
        const duffelSupplierPrice = Number(booking.total_price ?? 0);
        const cancellationId: string = quote.id;

        // Compute refund ratio from Duffel (refund / supplier price).
        // Apply that ratio to the actual Stripe charge so the shown refund
        // never exceeds what the customer originally paid, regardless of FX drift.
        const refundRatio = duffelSupplierPrice > 0
            ? Math.min(1, duffelRefundUsd / duffelSupplierPrice)
            : 1;

        // Prefer Stripe PI amount (exact cents in the payment currency)
        let refundAmount: number;
        let refundCurrency: string = booking.payment_currency ?? booking.currency ?? 'USD';
        try {
            if (booking.payment_intent_id) {
                const pi = await stripe.paymentIntents.retrieve(booking.payment_intent_id);
                refundAmount = Math.round((pi.amount / 100) * refundRatio * 100) / 100;
                refundCurrency = pi.currency.toUpperCase();
            } else {
                refundAmount = Math.round(Number(booking.charged_price ?? booking.total_price ?? 0) * refundRatio * 100) / 100;
            }
        } catch {
            refundAmount = Math.round(Number(booking.charged_price ?? booking.total_price ?? 0) * refundRatio * 100) / 100;
        }

        console.log(`[cancel-quote] bookingId=${bookingId} orderId=${orderId} duffelRefund=${duffelRefundUsd} ratio=${refundRatio.toFixed(4)} displayRefund=${refundAmount} ${refundCurrency} cancellationId=${cancellationId}`);

        return NextResponse.json({ success: true, refundAmount, refundCurrency, penaltyAmount: 0, cancellationId });
    } catch (err: any) {
        if (err.name === 'AbortError') {
            return NextResponse.json({ success: false, error: 'Airline system timed out. Try again.' }, { status: 504 });
        }
        console.error('[cancel-quote] error:', err);
        return NextResponse.json({ success: false, error: err.message ?? 'Failed to get cancellation quote' }, { status: 500 });
    }
}
