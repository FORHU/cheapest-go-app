import { createAdminClient } from '@/utils/postgres/admin';
import { NextRequest } from 'next/server';
import { getAuthenticatedUser } from '@/lib/server/auth';
import { confirmAndSaveTgxBooking } from '@/lib/server/bookings';
import { stripe } from '@/lib/stripe/server';
import { isBookingReference } from '@/lib/bookingReference';
import { createNotification } from '@/lib/server/admin/notify';
import { extractStripeFee, STRIPE_FEE_EXPAND, type RecordedStripeFee } from '@/lib/stripe/fee';

export const maxDuration = 120;
import { sendBookingConfirmationEmail } from '@/lib/server/email';
import { revalidatePath } from 'next/cache';
import { rateLimit } from '@/lib/server/rate-limit';
import { safeError } from '@/lib/server/safe-error';
import { checkCsrf } from '@/lib/server/csrf';
import { bookingConfirmSchema } from '@/lib/schemas/booking';
import { env } from '@/utils/env';

export const dynamic = 'force-dynamic';


export async function POST(req: NextRequest) {
    const csrfError = checkCsrf(req);
    if (csrfError) return csrfError;

    // Auth first so rate limit keys on user ID instead of IP (IP is spoofable)
    const { user, error: authError } = await getAuthenticatedUser();
    if (authError || !user) {
        return Response.json(
            { success: false, error: 'Authentication required' },
            { status: 401 }
        );
    }

    // 5 booking confirmations per minute per user
    const rl = await rateLimit(req, { limit: 5, windowMs: 60_000, prefix: 'hotel-confirm', userId: user.id });
    if (!rl.success) {
        return Response.json({ success: false, error: 'Too many requests. Please wait before trying again.' }, { status: 429 });
    }

    try {

        const body = await req.json();
        const parsed = bookingConfirmSchema.safeParse(body);
        if (!parsed.success) {
            return Response.json(
                { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid request' },
                { status: 400 }
            );
        }

        // The reference was minted before the charge and lives on the PaymentIntent. Read it
        // back from Stripe rather than accepting it from the request body — the client must
        // not be able to choose the identifier a payment is filed under.
        let bookingReference: string | undefined;

        // What Stripe actually took, read off the balance transaction rather than
        // estimated from STRIPE_RATE. Empty when there is no PaymentIntent to read.
        let stripeFee: RecordedStripeFee = {};

        // ── Stripe payment verification (when paymentIntentId is present) ──
        if (body.paymentIntentId) {
            // Expanded so the real Stripe fee can be recorded alongside the booking.
            // This retrieve already had to happen for the reference, so the fee costs
            // no extra API call — and `STRIPE_RATE` in pricing.ts is only an estimate
            // of it, never checked against anything until now. See ADR-0036.
            const pi = await stripe.paymentIntents.retrieve(body.paymentIntentId, {
                expand: STRIPE_FEE_EXPAND,
            });
            stripeFee = extractStripeFee(pi);
            bookingReference = isBookingReference(pi.metadata?.bookingReference)
                ? pi.metadata.bookingReference
                : undefined;

            if (pi.status !== 'succeeded') {
                return Response.json(
                    { success: false, error: `Payment not completed (status: ${pi.status})` },
                    { status: 400 }
                );
            }

            // Security: verify the payment belongs to this user
            if (pi.metadata?.userId !== user.id) {
                return Response.json(
                    { success: false, error: 'Payment does not belong to this user' },
                    { status: 403 }
                );
            }

            // Idempotency: if a booking already exists for this PaymentIntent, return it.
            // This handles the case where confirm succeeded but the client retried (network error,
            // double-click that bypassed the UI guard, etc.).
            const svc = createAdminClient();
            const { data: existingBooking } = await svc
                .from('bookings')
                .select('booking_id, status, total_price, currency')
                .eq('payment_intent_id', body.paymentIntentId)
                .maybeSingle();

            if (existingBooking) {
                console.log(`[confirm] Idempotent return — booking already exists for PI ${body.paymentIntentId}: ${existingBooking.booking_id}`);
                return Response.json({
                    success: true,
                    data: {
                        bookingId: existingBooking.booking_id,
                        status: existingBooking.status,
                        policyType: 'standard',
                        policySummary: '',
                        totalPrice: existingBooking.total_price,
                        currency: existingBooking.currency,
                    },
                });
            }
        }

        // TravelgateX path: prebookId is encoded as "TGX:{quoteToken}"
        const quoteToken = String(body.prebookId).startsWith('TGX:')
            ? String(body.prebookId).slice(4)
            : String(body.prebookId);

        const result = await confirmAndSaveTgxBooking({
            quoteToken,
            holder: body.holder,
            guests: body.guests || [],
            propertyName: body.propertyName || '',
            propertyImage: body.propertyImage,
            roomName: body.roomName || body.holder?.firstName || 'Standard Room',
            checkIn: body.checkIn || '',
            checkOut: body.checkOut || '',
            adults: body.adults || 2,
            children: body.children || 0,
            currency: body.currency || 'USD',
            specialRequests: body.specialRequests,
            paymentIntentId: body.paymentIntentId,
            bookingReference,
            voucherCode: body.voucherCode,
            discountAmount: body.discountAmount,
            cancellationPolicies: body.cancellationPolicies,
            quotedPrice: body.quotedPrice,
        }, user);

        if (result.success) {
            revalidatePath('/trips');

            // Record what Stripe really took, merged into provider_metadata rather than
            // threaded through the two INSERT sites in bookings.ts. Additive and
            // fire-and-forget: a booking that exists must never be jeopardised by a
            // reporting figure. Flights get the same number via the financial ledger.
            if (result.data?.bookingId && stripeFee.stripeFee !== undefined) {
                recordHotelStripeFee(result.data.bookingId, stripeFee)
                    .catch(e => console.error('[confirm] Stripe fee record failed:', e));
            }

            createNotification(
                'Hotel Booking Confirmed',
                `Booking ${result.data?.bookingId || ''} confirmed for ${user.email}.`,
                'booking'
            );
            sendBookingConfirmationEmail({
                bookingId: result.data?.bookingId || '',
                dbId: result.data?.dbId,
                email: body.holder?.email || user.email || '',
                guestName: `${body.holder?.firstName || ''} ${body.holder?.lastName || ''}`.trim(),
                hotelName: body.propertyName || '',
                roomName: body.roomName || '',
                checkIn: body.checkIn || '',
                checkOut: body.checkOut || '',
                totalPrice: result.data?.totalPrice || 0,
                currency: result.data?.currency || body.currency || 'USD',
                propertyImage: body.propertyImage,
                propertyAddress: result.data?.propertyAddress,
                propertyCity: result.data?.propertyCity,
                propertyCountry: result.data?.propertyCountry,
                starRating: result.data?.starRating,
                reviewRating: result.data?.reviewRating,
                reviewCount: result.data?.reviewCount,
                checkInTime: result.data?.checkInTime,
                checkOutTime: result.data?.checkOutTime,
                adults: body.adults,
                children: body.children,
                // Not body.discountAmount: that's unvalidated client input (bookingConfirmSchema
                // doesn't even declare the field) and doesn't correspond to anything the server
                // actually charged — resolveHotelChargeBase() prices purely off the prebook quote,
                // with no voucher/discount factored in. Showing it here would print a fabricated
                // "credit" line. Revisit once server-side voucher validation actually adjusts the
                // charged amount and a trustworthy discount figure exists to show.
                cancellationPolicy: body.cancellationPolicies,
            }).catch(e => console.error('[confirm] Email failed:', e));
            return Response.json(result);
        }

        // Price increased beyond threshold — refund then tell the client
        if (!result.success && result.errorCode === 'price_changed' && body.paymentIntentId) {
            try {
                const refund = await stripe.refunds.create({ payment_intent: body.paymentIntentId });
                console.log(`[confirm] Price-change refund ${refund.id} issued`);
            } catch (refundErr: any) {
                console.error('[confirm] Price-change refund failed:', refundErr.message);
            }
            return Response.json({
                success: false,
                errorCode: 'price_changed',
                oldPrice: result.oldPrice,
                newPrice: result.newPrice,
                error: 'The price for this room increased after you were quoted. Your payment has been automatically refunded.',
            });
        }

        // Booking failed — refund Stripe payment if captured
        if (!result.providerConfirmed && body.paymentIntentId) {
            // Supplier-side balance/credit exhaustion is a platform issue, not a fault of
            // this booking — it silently blocks ALL hotel bookings until the TravelgateX
            // B2B wallet is topped up. Alert ops and show the customer a neutral message
            // instead of the raw provider code.
            const isBalanceErr = /insufficient_b2b_balance|b2b_balance|insufficient.*balance/i.test(result.error || '');
            if (isBalanceErr) {
                console.error('[confirm] CRITICAL: TravelgateX B2B balance exhausted — hotel bookings will keep failing until topped up.');
                createNotification(
                    'CRITICAL: TravelgateX B2B balance exhausted',
                    `Hotel booking failed with "${result.error}" for ${user.email}. All hotel bookings will fail until the TravelgateX B2B balance is topped up. PaymentIntent: ${body.paymentIntentId}.`,
                    'booking'
                );
            }
            const baseError = isBalanceErr
                ? 'Hotel booking is temporarily unavailable'
                : (result.error || 'Booking failed');
            const failureCode = isBalanceErr ? 'balance_insufficient' : 'booking_failed_refunded';
            try {
                const refund = await stripe.refunds.create({ payment_intent: body.paymentIntentId });
                console.log(`[confirm] Auto-refunded ${refund.id} for failed booking`);
                return Response.json({
                    success: false,
                    errorCode: failureCode,
                    error: baseError + '. Your payment has been automatically refunded.',
                });
            } catch (refundErr: any) {
                console.error('[confirm] Refund failed:', refundErr.message);
                return Response.json({
                    success: false,
                    errorCode: failureCode,
                    error: baseError + '. Please contact support for a refund.',
                });
            }
        }

        // DB save failed after booking confirmed — do NOT refund
        if (result.providerConfirmed) {
            createNotification(
                'CRITICAL: DB Save Failed After Booking Confirm',
                `Booking ${result.data?.bookingId || 'unknown'} confirmed for ${user.email} but DB save failed. Manual reconciliation required. PaymentIntent: ${body.paymentIntentId || 'N/A'}`,
                'booking'
            );
            return Response.json({
                success: false,
                error: result.error,
                data: result.data,
            }, { status: 500 });
        }

        return Response.json(result);
    } catch (err) {
        return Response.json(
            { success: false, error: safeError(err, 'booking/confirm') },
            { status: 500 }
        );
    }
}

/**
 * Merge the real Stripe fee into a hotel booking's `provider_metadata`.
 *
 * Merged rather than written as a column, so no migration is needed — and merged
 * rather than replaced, so it cannot clobber the supplier references
 * (`supplierRef`, `hotelRef`, `hotelCode`, `clientReference`) that cancellation
 * depends on and that are written into the same jsonb at INSERT time.
 *
 * `STRIPE_RATE` in pricing.ts prices the booking from an estimate; this is what
 * was actually taken. Keeping both is what makes the estimate checkable. See
 * ADR-0036.
 */
async function recordHotelStripeFee(bookingId: string, fee: RecordedStripeFee): Promise<void> {
    const svc = createAdminClient();
    const { data, error: readErr } = await svc
        .from('bookings')
        .select('provider_metadata')
        .eq('booking_id', bookingId)
        .maybeSingle();

    if (readErr || !data) {
        console.error('[confirm] Stripe fee: booking not readable:', readErr?.message ?? 'no row');
        return;
    }

    // provider_metadata has been double-encoded in the past (see travelgatex-cancel),
    // so a string here is parsed rather than spread character by character.
    let existing = data.provider_metadata as unknown;
    if (typeof existing === 'string') {
        try { existing = JSON.parse(existing); } catch { existing = {}; }
    }

    const { error } = await svc
        .from('bookings')
        .update({ provider_metadata: { ...(existing as object ?? {}), ...fee } })
        .eq('booking_id', bookingId);

    if (error) console.error('[confirm] Stripe fee: update failed:', error.message);
    else console.log(`[confirm] Stripe fee recorded for ${bookingId}: ${fee.stripeFee} ${fee.stripeFeeCurrency} (${((fee.stripeFeeRate ?? 0) * 100).toFixed(2)}%)`);
}
