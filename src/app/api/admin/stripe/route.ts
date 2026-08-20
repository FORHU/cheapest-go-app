import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isAuthError } from '@/lib/server/admin';
import { rateLimit } from '@/lib/server/rate-limit';
import { getStripe } from '@/lib/stripe/server';
import { createAdminClient } from '@/utils/postgres/admin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const rl = await rateLimit(req, { limit: 20, windowMs: 60_000, prefix: 'admin-stripe' });
    if (!rl.success) return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });

    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    const stripe = getStripe();

    // Fire all Stripe API calls concurrently
    const [balance, charges, refunds, disputes, payouts] = await Promise.all([
        stripe.balance.retrieve(),

        stripe.paymentIntents.list({ limit: 20, expand: ['data.latest_charge'] }),

        stripe.refunds.list({ limit: 10 }),

        stripe.disputes.list({ limit: 10 }),

        stripe.payouts.list({ limit: 5 }),
    ]);

    // ── Balance ─────────────────────────────────────────────────────────────
    const available = balance.available.map(b => ({ amount: b.amount / 100, currency: b.currency.toUpperCase() }));
    const pending   = balance.pending.map(b => ({ amount: b.amount / 100, currency: b.currency.toUpperCase() }));

    // ── Payment intents ──────────────────────────────────────────────────────
    const payments = charges.data.map(pi => {
        const charge = (pi as any).latest_charge as any;
        return {
            id:          pi.id,
            amount:      pi.amount / 100,
            currency:    pi.currency.toUpperCase(),
            status:      pi.status,
            description: pi.description ?? charge?.description ?? null,
            customer:    charge?.billing_details?.email ?? charge?.billing_details?.name ?? null,
            created:     pi.created * 1000,
            metadata:    pi.metadata,
            refunded:    charge?.refunded ?? false,
            captured:    charge?.captured ?? (pi.status === 'succeeded'),
        };
    });

    // ── Refunds ──────────────────────────────────────────────────────────────
    const refundList = refunds.data.map(r => ({
        id:       r.id,
        amount:   r.amount / 100,
        currency: r.currency.toUpperCase(),
        status:   r.status,
        reason:   r.reason ?? null,
        created:  r.created * 1000,
        chargeId: r.charge as string | null,
    }));

    // ── Disputes ─────────────────────────────────────────────────────────────
    const disputeList = disputes.data.map(d => ({
        id:       d.id,
        amount:   d.amount / 100,
        currency: d.currency.toUpperCase(),
        status:   d.status,
        reason:   d.reason,
        created:  d.created * 1000,
        chargeId: d.charge as string | null,
    }));

    // ── Payouts ──────────────────────────────────────────────────────────────
    const payoutList = payouts.data.map(p => ({
        id:          p.id,
        amount:      p.amount / 100,
        currency:    p.currency.toUpperCase(),
        status:      p.status,
        arrivalDate: p.arrival_date * 1000,
        created:     p.created * 1000,
    }));

    // ── Quick stats ───────────────────────────────────────────────────────────
    const succeeded     = payments.filter(p => p.status === 'succeeded');
    const totalVolume   = succeeded.reduce((s, p) => s + p.amount, 0);
    const totalRefunded = refundList.reduce((s, r) => s + r.amount, 0);

    return NextResponse.json({
        success: true,
        balance: { available, pending },
        stats: {
            totalPayments:  payments.length,
            succeeded:      succeeded.length,
            totalVolume:    Math.round(totalVolume * 100) / 100,
            totalRefunded:  Math.round(totalRefunded * 100) / 100,
            openDisputes:   disputeList.filter(d => !['won', 'lost'].includes(d.status)).length,
        },
        payments,
        refunds: refundList,
        disputes: disputeList,
        payouts: payoutList,
        liveMode: !process.env.STRIPE_SECRET_KEY?.includes('test'),
    });
}

/**
 * POST /api/admin/stripe
 * Force-issue a Stripe refund for a booking by bookingId.
 * Looks up payment_intent_id from DB, falls back to Stripe metadata search.
 * Body: { bookingId: string; reason?: string }
 */
export async function POST(req: NextRequest) {
    const rl = await rateLimit(req, { limit: 10, windowMs: 60_000, prefix: 'admin-stripe-refund' });
    if (!rl.success) return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });

    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    const stripe = getStripe();
    const svc = createAdminClient();

    let body: { bookingId?: string; reason?: string };
    try { body = await req.json(); } catch {
        return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
    }

    const { bookingId, reason = 'requested_by_customer' } = body;
    if (!bookingId) return NextResponse.json({ success: false, error: 'bookingId is required' }, { status: 400 });

    // 1. Look up payment_intent_id from DB
    const { data: booking } = await svc
        .from('bookings')
        .select('payment_intent_id, status, total_price, currency, holder_email')
        .eq('booking_id', bookingId)
        .maybeSingle();

    if (!booking) return NextResponse.json({ success: false, error: `Booking ${bookingId} not found` }, { status: 404 });

    let piId = booking.payment_intent_id as string | null;

    // 2. Fallback: search Stripe by bookingId in metadata
    if (!piId) {
        const searchResult = await stripe.paymentIntents.search({
            query: `metadata['bookingId']:'${bookingId}'`,
            limit: 1,
        });
        if (searchResult.data.length > 0) {
            piId = searchResult.data[0].id;
            // Persist so future operations don't need to search
            await svc.from('bookings').update({ payment_intent_id: piId }).eq('booking_id', bookingId);
        }
    }

    // 3. Also try searching by prebookId pattern if still not found
    if (!piId) {
        return NextResponse.json({
            success: false,
            error: `No Stripe payment intent found for booking ${bookingId}. Check Stripe dashboard manually.`,
        }, { status: 404 });
    }

    // 4. Issue refund (or reconcile if already refunded in Stripe)
    try {
        const pi = await stripe.paymentIntents.retrieve(piId, { expand: ['latest_charge'] });

        // If already fully refunded in Stripe (e.g. via dashboard), just sync the DB status
        const charge = (pi as any).latest_charge;
        if (charge?.refunded) {
            await svc.from('bookings').update({
                status: 'cancelled_refunded',
                updated_at: new Date().toISOString(),
            }).eq('booking_id', bookingId);
            return NextResponse.json({
                success: true,
                alreadyRefunded: true,
                message: 'Refund already exists in Stripe — booking status updated to cancelled_refunded.',
                piId,
            });
        }

        if (pi.status !== 'succeeded') {
            return NextResponse.json({
                success: false,
                error: `PaymentIntent ${piId} is in status "${pi.status}" — cannot refund`,
            }, { status: 400 });
        }

        const refund = await stripe.refunds.create({
            payment_intent: piId,
            reason: reason as any,
            metadata: { bookingId, adminForced: 'true' },
        }, { idempotencyKey: `admin-refund-${bookingId}` });

        await svc.from('bookings').update({
            status: 'cancelled_refunded',
            updated_at: new Date().toISOString(),
        }).eq('booking_id', bookingId);

        return NextResponse.json({
            success: true,
            refundId: refund.id,
            amount: refund.amount / 100,
            currency: refund.currency.toUpperCase(),
            status: refund.status,
        });
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
