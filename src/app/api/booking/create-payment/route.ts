import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/server/auth';
import { stripe } from '@/lib/stripe/server';
import { rateLimit } from '@/lib/server/rate-limit';
import { checkCsrf } from '@/lib/server/csrf';
import { applyMarkup, toStripeAmount, HOTEL_MARKUP, BUNDLE_MARKUP } from '@/lib/pricing';
import { convertCurrencyStrict, refreshExchangeRates } from '@/lib/currency';
import { resolveHotelChargeBase } from '@/lib/bookings/hotelChargeBase';
import { createAdminClient } from '@/utils/postgres/admin';
import { env } from '@/utils/env';
import { createHash } from 'crypto';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    const csrfError = checkCsrf(req);
    if (csrfError) return csrfError;

    // 5 payment initiations per minute per IP
    const rl = await rateLimit(req, { limit: 5, windowMs: 60_000, prefix: 'hotel-payment' });
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
        const { prebookId, amount, currency, holderEmail, propertyName, roomName, bundleFlightId, checkIn, checkOut } = body as {
            prebookId: string;
            amount: number;
            currency: string;
            holderEmail: string;
            propertyName?: string;
            roomName?: string;
            checkIn?: string;
            checkOut?: string;
            /** If set, user is bundling this hotel with a completed flight booking → 12% bundle rate applies instead of 15% standalone */
            bundleFlightId?: string;
        };

        // Supported currencies — prevents charging in unsupported/invalid currencies
        const SUPPORTED_CURRENCIES = new Set([
            'usd', 'eur', 'gbp', 'aud', 'cad', 'sgd', 'hkd', 'jpy', 'krw',
            'thb', 'php', 'myr', 'idr', 'inr', 'aed', 'nzd', 'chf', 'sek',
            'nok', 'dkk', 'brl', 'mxn', 'zar', 'try', 'pln', 'czk', 'huf',
        ]);

        // Per-currency maximum amounts (≈ $100,000 USD equivalent per currency).
        // The old flat cap of 1,000,000 was designed for USD — it wrongly rejects
        // legitimate bookings in high-unit currencies like KRW (₩1M ≈ $714) and IDR.
        const MAX_AMOUNT_BY_CURRENCY: Record<string, number> = {
            // Standard decimal currencies — $100k USD equivalent
            usd: 100_000,     eur: 95_000,      gbp: 80_000,
            aud: 160_000,     cad: 140_000,     sgd: 140_000,
            hkd: 800_000,     chf: 92_000,      nzd: 170_000,
            aed: 370_000,     inr: 8_500_000,   thb: 3_600_000,
            php: 5_800_000,   myr: 480_000,     brl: 510_000,
            mxn: 1_700_000,   zar: 1_900_000,   try: 3_200_000,
            pln: 410_000,     czk: 2_300_000,   huf: 37_000_000,
            sek: 1_100_000,   nok: 1_100_000,   dkk: 700_000,
            // Zero-decimal currencies — amounts are whole units, so limits are larger
            jpy: 15_000_000,  krw: 140_000_000, idr: 1_600_000_000,
            vnd: 2_500_000_000,
        };
        const maxAmount = MAX_AMOUNT_BY_CURRENCY[currency?.toLowerCase()] ?? 100_000;

        // Validate
        if (!prebookId) {
            return NextResponse.json({ success: false, error: 'prebookId is required' }, { status: 400 });
        }
        if (!amount || typeof amount !== 'number' || amount <= 0 || amount > maxAmount) {
            return NextResponse.json({ success: false, error: `Valid amount is required (must be between 0 and ${maxAmount.toLocaleString()} ${currency?.toUpperCase() ?? ''})` }, { status: 400 });
        }
        if (!currency) {
            return NextResponse.json({ success: false, error: 'Currency is required' }, { status: 400 });
        }
        if (!SUPPORTED_CURRENCIES.has(currency.toLowerCase())) {
            return NextResponse.json({ success: false, error: `Unsupported currency: ${currency}` }, { status: 400 });
        }

        // ── Duplicate booking guard ──
        // Warn if the user already has an active booking for the same property + overlapping dates.
        if (propertyName && checkIn && checkOut) {
            const svc = createAdminClient();
            const ACTIVE_STATUSES = ['confirmed', 'pending', 'completed'];
            const { data: existing } = await svc
                .from('bookings')
                .select('booking_id, check_in, check_out')
                .eq('user_id', user.id)
                .eq('property_name', propertyName)
                .in('status', ACTIVE_STATUSES)
                .lt('check_in', checkOut)   // overlap: existing starts before new ends
                .gt('check_out', checkIn)   // overlap: existing ends after new starts
                .limit(1)
                .maybeSingle();

            if (existing) {
                return NextResponse.json({
                    success: false,
                    code: 'DUPLICATE_BOOKING',
                    existingBookingId: existing.booking_id,
                    existingCheckIn: existing.check_in,
                    existingCheckOut: existing.check_out,
                    error: `You already have an active booking at ${propertyName} for overlapping dates.`,
                }, { status: 409 });
            }
        }

        // ── Establish the trusted base price ──
        //
        // `amount` arrives already converted by the browser (usePricingCalculation),
        // so it is both client-controlled and dependent on client-side FX. Charge from
        // the supplier quote recorded at prebook time instead, and convert it here.
        const svcDb = createAdminClient();
        const { data: quote } = await svcDb
            .from('hotel_prebook_quotes')
            .select('gross, currency, expires_at')
            .eq('prebook_id', prebookId)
            .maybeSingle();

        // Rates must be live before the conversion inside resolveHotelChargeBase.
        if (quote && String(quote.currency).toUpperCase() !== currency.toUpperCase()) {
            await refreshExchangeRates();
        }

        const resolved = resolveHotelChargeBase(quote, amount, currency, convertCurrencyStrict);

        if (!resolved.ok) {
            console.warn(
                `[create-payment] Rejected (${resolved.code}) prebookId=${prebookId.slice(0, 40)} ` +
                `client=${amount} ${currency.toUpperCase()}` +
                (resolved.serverPrice !== undefined ? ` server=${resolved.serverPrice}` : '')
            );
            return NextResponse.json({
                success: false,
                error: resolved.message,
                code: resolved.code,
                ...(resolved.serverPrice !== undefined
                    ? { serverPrice: resolved.serverPrice, currency: resolved.currency }
                    : {}),
            }, { status: resolved.code === 'FX_UNAVAILABLE' ? 503 : 409 });
        }

        const baseInChargeCurrency = resolved.base;

        // Apply platform markup — bundle rate (4%) when paired with a flight, standalone rate (5%) otherwise.
        // See src/lib/pricing.ts for full strategy documentation.
        // Markup is applied to the server-derived base, never to the client's figure.
        const markupRate = bundleFlightId ? BUNDLE_MARKUP : HOTEL_MARKUP;
        const pricing = applyMarkup(baseInChargeCurrency, markupRate);
        const stripeAmount = toStripeAmount(pricing.chargedPrice, currency);

        console.log(`[create-payment] Hotel pricing: quote=${resolved.quoteGross} ${resolved.quoteCurrency} → base=${pricing.originalPrice} ${currency}, charged=${pricing.chargedPrice}, markup=${(markupRate * 100).toFixed(0)}%${bundleFlightId ? ' (bundle)' : ' (standalone)'}`);

        // Create Stripe PaymentIntent (automatic capture — refund on LiteAPI failure)
        // Include amount+currency in the hash so a price change (prebook refresh) produces a new key
        // rather than a "same key, different params" Stripe rejection.
        const prebookHash = createHash('sha256')
            .update(`${prebookId}:${stripeAmount}:${currency.toLowerCase()}`)
            .digest('hex')
            .slice(0, 40);
        const idempotencyKey = `hotel-pi-${user.id}-${prebookHash}`;
        const paymentIntent = await stripe.paymentIntents.create({
            amount: stripeAmount,
            currency: currency.toLowerCase(),
            capture_method: 'automatic',
            metadata: {
                prebookId: prebookId.slice(0, 490),
                userId: user.id,
                holderEmail: holderEmail || '',
                type: bundleFlightId ? 'hotel_bundle' : 'hotel',
                bundleFlightId: bundleFlightId || '',
                originalPrice: String(pricing.originalPrice),
                markupRate: String(markupRate),
                markupAmount: String(pricing.markupAmount),
            },
            description: `CG: ${propertyName || 'Hotel'} — ${roomName || 'Room'}`,
        }, { idempotencyKey });

        return NextResponse.json({
            success: true,
            data: {
                clientSecret: paymentIntent.client_secret,
                paymentIntentId: paymentIntent.id,
            },
        });
    } catch (err: any) {
        console.error('[create-payment] Error:', err);
        const message = process.env.NODE_ENV === 'production'
            ? 'Failed to create payment. Please try again.'
            : (err.message || 'Failed to create payment');
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}
