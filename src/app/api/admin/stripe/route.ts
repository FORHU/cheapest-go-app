import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isAuthError } from '@/lib/server/admin';
import { rateLimit } from '@/lib/server/rate-limit';
import { getStripe } from '@/lib/stripe/server';

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
