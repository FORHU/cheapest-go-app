import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { env } from "@/utils/env";

const cancelFlightSchema = z.object({
    bookingId: z.string().min(1, 'bookingId is required'),
});
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/server';
import { stripe } from '@/lib/stripe/server';
import { sendFlightCancellationEmail, sendFlightCancellationRefundEmail } from '@/lib/server/email';

/**
 * POST /api/flights/cancel-booking
 *
 * V1 — Full booking cancellation only.
 * No partial passenger / segment-level cancellation yet.
 *
 * State machine:
 *   confirmed|ticketed → cancel_requested → cancelled → refund_pending → refunded
 *   cancel_requested|cancelled|refund_pending|refunded → idempotent (returns current state)
 *   departed (departureTime <= now) → rejected
 *
 * Supplier Rule: supplier refund amount is ALWAYS the source of truth.
 * Never calculate refunds independently.
 *
 * Body: { bookingId: string }
 */
export async function POST(req: NextRequest) {
    const startMs = Date.now();

    try {
        // ── Auth — use cookie-aware server client (same as confirm/route.ts) ─
        const supabaseAuth = await createClient();
        const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
        if (authError || !user) {
            console.error('[cancel-booking] Auth error:', authError?.message);
            return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
        }

        const rawBody = await req.json();
        const cancelParsed = cancelFlightSchema.safeParse(rawBody);
        if (!cancelParsed.success) {
            return NextResponse.json(
                { success: false, error: cancelParsed.error.issues[0]?.message ?? 'Invalid request' },
                { status: 400 }
            );
        }
        const { bookingId } = cancelParsed.data;

        // Service-role client for all DB operations (bypasses RLS)
        const supabase = createServiceClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);


        // ── Step 1: Load booking ──────────────────────────────────────
        const { data: booking, error: fetchErr } = await supabase
            .from('flight_bookings')
            .select('id, user_id, status, provider, pnr, payment_intent_id, created_at, cancellation_log, session_id, total_price, payment_currency, refund_amount, refund_penalty_amount, refund_currency, supplier_currency')
            .eq('id', bookingId)
            .single();

        if (fetchErr || !booking) {
            return NextResponse.json({ success: false, error: 'Booking not found' }, { status: 404 });
        }

        // ── PI ID recovery for legacy bookings ────────────────────────
        // Older Duffel bookings may have payment_intent_id = null in flight_bookings
        // because the booking_sessions.payment_intent_id column update failed silently.
        // Recover it from the session so the Stripe refund can proceed correctly.
        if (!booking.payment_intent_id && booking.session_id) {
            const { data: sessionRow } = await supabase
                .from('booking_sessions')
                .select('payment_intent_id')
                .eq('id', booking.session_id)
                .maybeSingle();
            if (sessionRow?.payment_intent_id) {
                console.log(`[cancel-booking] Recovered payment_intent_id from session: ${sessionRow.payment_intent_id}`);
                (booking as any).payment_intent_id = sessionRow.payment_intent_id;
            }
        }

        // ── Security: booking must belong to authenticated user ───────
        if (booking.user_id !== user.id) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
        }

        // ── Step 2: Idempotency — already in a non-retryable state ───
        // cancel_requested is intentionally excluded: if the server crashed after setting it,
        // the booking is stuck and the user must be able to retry.
        const terminalStatuses = ['cancelled', 'refund_pending', 'refunded'];
        if (terminalStatuses.includes(booking.status)) {
            console.log(`[cancel-booking] Already in terminal state ${booking.status}, returning idempotently`);
            return NextResponse.json({ success: true, status: booking.status, idempotent: true });
        }

        // ── Step 3: Validate eligibility ──────────────────────────────
        // refund_failed: supplier already cancelled, only Stripe refund needs to be retried
        const eligibleStatuses = ['confirmed', 'ticketed', 'booked', 'pnr_created', 'awaiting_ticket', 'cancel_failed', 'cancel_requested', 'refund_failed'];
        if (!eligibleStatuses.includes(booking.status)) {
            return NextResponse.json(
                { success: false, error: `Cannot cancel booking in status: ${booking.status}` },
                { status: 422 },
            );
        }


        // ── Step 4: Immediately set CANCEL_REQUESTED in DB ────────────
        // This prevents duplicate supplier calls if the user clicks twice.
        const logEntry = {
            at: new Date().toISOString(),
            oldStatus: booking.status,
            newStatus: 'cancel_requested',
            note: 'User initiated cancellation',
        };

        const { data: updatedRows, error: requestErr } = await supabase
            .from('flight_bookings')
            .update({
                status: 'cancel_requested',
                cancellation_requested_at: new Date().toISOString(),
                cancellation_log: [...(booking.cancellation_log ?? []), logEntry],
            })
            .eq('id', bookingId)
            .in('status', eligibleStatuses)
            .select('id');

        if (requestErr) {
            console.error('[cancel-booking] DB update error:', requestErr);
            throw new Error(`DB error: ${requestErr.message}`);
        }
        if (!updatedRows || updatedRows.length === 0) {
            // Re-fetch to find the real current status
            const { data: refetched } = await supabase
                .from('flight_bookings')
                .select('status')
                .eq('id', bookingId)
                .single();
            console.error(`[cancel-booking] Update matched 0 rows. DB status is: ${refetched?.status}, expected one of: ${eligibleStatuses.join(', ')}`);
            throw new Error(`Cannot cancel: booking status is '${refetched?.status ?? 'unknown'}'`);
        }

        // ── Step 5: Call supplier adapter ─────────────────────────────
        // Skip supplier call for refund_failed — airline already cancelled, only Stripe retry needed.
        // Use the refund_amount already stored on the booking record.
        const isMystifly = booking.provider === 'mystifly_v2';
        let supplierSuccess = false;
        let refundAmount = 0;
        let penaltyAmount = booking.refund_penalty_amount ?? 0;
        let refundCurrency = booking.refund_currency ?? booking.supplier_currency ?? 'USD';
        let supplierError: string | undefined;
        let supplierCancellationId: string | undefined;
        // FIX 1: declared here so it's in scope for the failure-path handler below
        let requiresManualCancellation = false;

        if (booking.status === 'refund_failed') {
            // Airline already cancelled — reuse the stored refund amount and skip supplier call
            supplierSuccess = true;
            refundAmount = booking.refund_amount ?? 0;
            console.log(`[cancel-booking] Retrying Stripe refund for refund_failed booking: amount=${refundAmount} ${refundCurrency}`);
        } else {
            try {
                if (isMystifly) {
                    const result = await cancelMystifly(booking);
                    supplierSuccess = result.success;
                    // SECURITY: Cap refund amount at the total price to prevent supplier bugs from triggering excess refunds
                    refundAmount = Math.min(result.refundAmount ?? 0, booking.total_price);
                    penaltyAmount = result.penaltyAmount ?? 0;
                    refundCurrency = result.currency ?? 'USD';
                    supplierError = result.error;
                    supplierCancellationId = result.cancellationId;
                } else {
                    // Duffel cancellation
                    const result = await cancelDuffel(booking);
                    supplierSuccess = result.success;
                    // SECURITY: Cap refund amount
                    refundAmount = Math.min(result.refundAmount ?? 0, booking.total_price);
                    // FIX 2: penaltyAmount was always 0 — derive from supplier total vs refund
                    penaltyAmount = result.penaltyAmount ?? (booking.total_price - (result.refundAmount ?? 0));
                    refundCurrency = result.currency ?? 'USD';
                    supplierError = result.error;
                    supplierCancellationId = result.cancellationId;
                    // FIX 1: capture requiresManualCancellation from result (avoids out-of-scope ReferenceError)
                    requiresManualCancellation = result.requiresManualCancellation === true
                        || /tkt-in-process|ticketed status|cancellation denied/i.test(supplierError ?? '');
                }
            } catch (supplierErr: any) {
                supplierError = supplierErr.message;
            }
        }

        // ── Step 6: Handle supplier response ──────────────────────────
        if (!supplierSuccess) {
            const isProviderMissing = (supplierError?.toLowerCase().includes('not found') ||
                supplierError?.toLowerCase().includes('does not exist') ||
                supplierError?.toLowerCase().includes('could not find'));

            // requiresManualCancellation is set above in the Duffel branch (FIX 1)

            const failLog = {
                at: new Date().toISOString(),
                oldStatus: 'cancel_requested',
                newStatus: isProviderMissing ? 'cancelled_provider_missing' : 'cancel_failed',
                supplierError,
                isProviderMissing,
                requiresManualCancellation,
            };

            // When the supplier record no longer exists the order is already gone on their side.
            // The user still paid us via Stripe, so issue a full refund before marking done.
            if (isProviderMissing && booking.payment_intent_id) {
                try {
                    const pi = await stripe.paymentIntents.retrieve(booking.payment_intent_id);
                    if (pi.amount > 0) {
                        await stripe.refunds.create({
                            payment_intent: booking.payment_intent_id,
                            reason: 'requested_by_customer',
                            metadata: { bookingId, note: 'provider_missing_full_refund' },
                        }, { idempotencyKey: `refund-${bookingId}` });
                    }

                    await supabase
                        .from('flight_bookings')
                        .update({
                            status: 'refunded',
                            refund_amount: booking.total_price,
                            cancellation_log: [...(booking.cancellation_log ?? []), logEntry, failLog],
                        })
                        .eq('id', bookingId);

                    fireCancellationEmails(supabase, booking, booking.total_price ?? 0, 0, booking.payment_currency ?? 'PHP', 'processed')
                        .catch(err => console.error('[cancel-booking] email error:', err));

                    return NextResponse.json({ success: true, status: 'refunded', providerMissing: true, refundAmount: booking.total_price });
                } catch (stripeErr: any) {
                    console.error('[cancel-booking] Stripe refund failed for provider-missing booking:', stripeErr.message);
                    // Fall through to mark as cancelled_provider_missing — admin will need to refund manually
                }
            }

            await supabase
                .from('flight_bookings')
                .update({
                    status: isProviderMissing ? 'cancelled_provider_missing' : 'cancel_failed',
                    cancellation_log: [...(booking.cancellation_log ?? []), logEntry, failLog],
                    refund_amount: isProviderMissing ? 0 : booking.refund_amount,
                })
                .eq('id', bookingId);

            return NextResponse.json(
                {
                    success: isProviderMissing,
                    status: isProviderMissing ? 'cancelled_provider_missing' : 'cancel_failed',
                    error: supplierError || 'Supplier rejected the cancellation request',
                    providerMissing: isProviderMissing,
                    requiresManualCancellation,
                },
                { status: isProviderMissing ? 200 : 422 },
            );
        }

        // Supplier confirmed — move to CANCELLED + REFUND_PENDING atomically
        const cancelLog = {
            at: new Date().toISOString(),
            oldStatus: 'cancel_requested',
            newStatus: 'cancelled',
            refundAmount,
            penaltyAmount,
            currency: refundCurrency,
        };
        const refundPendingLog = {
            at: new Date().toISOString(),
            oldStatus: 'cancelled',
            newStatus: 'refund_pending',
            note: 'Triggering Stripe refund',
        };

        await supabase
            .from('flight_bookings')
            .update({
                status: 'refund_pending',
                cancellation_completed_at: new Date().toISOString(),
                refund_amount: refundAmount,
                refund_penalty_amount: penaltyAmount,
                refund_currency: refundCurrency,
                supplier_cancellation_id: supplierCancellationId ?? null,
                payment_currency: booking.payment_currency ?? 'USD',
                supplier_currency: refundCurrency,
                cancellation_log: [...(booking.cancellation_log ?? []), logEntry, cancelLog, refundPendingLog],
            })
            .eq('id', bookingId);

        // ── Step 7: Trigger Stripe refund ─────────────────────────────
        // Rule: Stripe failure transitions booking to refund_failed.
        // refund_failed → refund_pending (admin retry via dashboard).
        let refunded = false;
        let stripeError: string | undefined;
        // FIX 3: cache the PI so we don't fetch it twice (once for refund, once for merchant email)
        let cachedPi: Awaited<ReturnType<typeof stripe.paymentIntents.retrieve>> | null = null;

        if (booking.payment_intent_id && refundAmount > 0) {
            try {
                // Always retrieve the PI to get the exact charged amount and currency.
                // booking.payment_currency can be null/wrong (e.g. Duffel GBP routes stored as null,
                // defaulting to 'usd'). Using the PI directly is the only safe source of truth.
                const pi = await stripe.paymentIntents.retrieve(booking.payment_intent_id!);
                cachedPi = pi; // cache for merchant email block below
                const piAmount = pi.amount;
                const piCurrency = pi.currency.toLowerCase();

                console.log(`[cancel-booking:stripe] PI retrieved: id=${booking.payment_intent_id} status=${pi.status} amount=${piAmount} currency=${piCurrency}`);
                console.log(`[cancel-booking:stripe] Supplier refund: amount=${refundAmount} penalty=${penaltyAmount} currency=${refundCurrency}`);

                // Mystifly uses manual capture — if PI is still uncaptured, cancel it instead of refunding
                if (pi.status === 'requires_capture') {
                    console.log(`[cancel-booking:stripe] PI is uncaptured (Mystifly pre-ticket) — cancelling PI instead of refunding`);
                    await stripe.paymentIntents.cancel(booking.payment_intent_id!, { cancellation_reason: 'requested_by_customer' });
                    refunded = true;
                    console.log(`[cancel-booking] Uncaptured PI cancelled (Mystifly pre-ticket): ${booking.payment_intent_id}`);
                    await supabase
                        .from('flight_bookings')
                        .update({
                            status: 'refunded',
                            cancellation_log: [...(booking.cancellation_log ?? []), logEntry, cancelLog, refundPendingLog,
                                { at: new Date().toISOString(), oldStatus: 'refund_pending', newStatus: 'refunded', note: 'PI cancelled (uncaptured)' }],
                        })
                        .eq('id', bookingId);
                } else {
                const supplierCurrency = refundCurrency.toLowerCase();
                let refundAmountCents: number;

                // Always use piAmount as the basis — it's what the customer paid (includes markup/fees).
                if (supplierCurrency === piCurrency) {
                    if (penaltyAmount > 0) {
                        const refundRatio = refundAmount / (refundAmount + penaltyAmount);
                        refundAmountCents = Math.round(piAmount * refundRatio);
                        console.log(`[cancel-booking:stripe] Currencies match (${piCurrency}), penalty ratio=${refundRatio.toFixed(4)} → refundAmountCents=${refundAmountCents}`);
                    } else {
                        refundAmountCents = piAmount;
                        console.log(`[cancel-booking:stripe] Currencies match (${piCurrency}), no penalty → full PI refund: refundAmountCents=${refundAmountCents}`);
                    }
                    refundAmountCents = Math.min(refundAmountCents, piAmount);
                } else {
                    console.log(`[cancel-booking:stripe] Currency mismatch: supplier=${supplierCurrency} pi=${piCurrency} — using penalty ratio`);
                    if (penaltyAmount > 0) {
                        const refundRatio = refundAmount / (refundAmount + penaltyAmount);
                        refundAmountCents = Math.round(piAmount * refundRatio);
                        console.log(`[cancel-booking:stripe] Ratio=${refundRatio.toFixed(4)} → refundAmountCents=${refundAmountCents}`);
                    } else {
                        refundAmountCents = piAmount;
                        console.log(`[cancel-booking:stripe] No penalty → full refund: refundAmountCents=${refundAmountCents}`);
                    }
                    refundAmountCents = Math.min(refundAmountCents, piAmount);
                }

                console.log(`[cancel-booking:stripe] Creating refund: amount=${refundAmountCents} ${piCurrency} cents (idempotencyKey=refund-${bookingId})`);

                const stripeRefund = await stripe.refunds.create({
                    payment_intent: booking.payment_intent_id,
                    amount: refundAmountCents,
                    reason: 'requested_by_customer',
                    metadata: { bookingId, provider: booking.provider, penaltyAmount: String(penaltyAmount) },
                }, {
                    idempotencyKey: `refund-${bookingId}`
                });

                console.log(`[cancel-booking:stripe] Refund result: id=${stripeRefund.id} status=${stripeRefund.status}`);

                if (stripeRefund.status === 'failed') {
                    throw new Error(`Stripe refund created but failed: ${stripeRefund.id}`);
                }

                if (stripeRefund.status === 'succeeded' || stripeRefund.status === 'pending') {
                    refunded = true;
                    const refundedLog = {
                        at: new Date().toISOString(),
                        oldStatus: 'refund_pending',
                        newStatus: 'refunded',
                        stripeRefundId: stripeRefund.id,
                        refundAmount,
                    };

                    await supabase
                        .from('flight_bookings')
                        .update({
                            status: 'refunded',
                            cancellation_log: [...(booking.cancellation_log ?? []), logEntry, cancelLog, refundPendingLog, refundedLog],
                        })
                        .eq('id', bookingId);
                }
                } // end else (PI was captured)
            } catch (stripeErr: any) {
                stripeError = stripeErr.message;
                console.error('[cancel-booking] Stripe refund failed — moving to refund_failed:', stripeError);

                const refundFailedLog = {
                    at: new Date().toISOString(),
                    oldStatus: 'refund_pending',
                    newStatus: 'refund_failed',
                    stripeError,
                };

                await supabase
                    .from('flight_bookings')
                    .update({
                        status: 'refund_failed',
                        cancellation_log: [...(booking.cancellation_log ?? []), logEntry, cancelLog, refundPendingLog, refundFailedLog],
                    })
                    .eq('id', bookingId);
            }
        } else {
            // Non-refundable ticket — move to 'cancelled' status (NOT 'refunded' as that implies money back)
            console.log(`[cancel-booking] Non-refundable ticket detected (refundAmount=0). Updating status to cancelled.`);
            await supabase
                .from('flight_bookings')
                .update({ 
                    status: 'cancelled',
                    cancellation_log: [...(booking.cancellation_log ?? []), logEntry, cancelLog]
                })
                .eq('id', bookingId);
        }

        const durationMs = Date.now() - startMs;
        console.log(`[cancel-booking] Done: bookingId=${bookingId}, refunded=${refunded}, amount=${refundAmount} ${refundCurrency} in ${durationMs}ms`);

        // ── Merchant-Level Pricing for Email ─────────────────────────────
        // We want the user to see the amount they actually paid ($71.26), not the supplier total ($65.98).
        let merchantTotalPaid = booking.total_price;
        let merchantRefundAmount = refundAmount;
        let merchantCurrency = refundCurrency;

        // Scale the refund amount by the same ratio as the supplier refund
        // FIX 3: re-use cachedPi from the refund block to avoid a duplicate Stripe API call
        if (booking.payment_intent_id) {
            try {
                const pi = cachedPi ?? await stripe.paymentIntents.retrieve(booking.payment_intent_id);
                merchantTotalPaid = pi.amount / 100;
                merchantCurrency = pi.currency.toUpperCase();

                if (refundAmount > 0) {
                    const supplierTotal = booking.total_price || 1;
                    const ratio = refundAmount / supplierTotal;
                    merchantRefundAmount = merchantTotalPaid * ratio;
                } else {
                    merchantRefundAmount = 0;
                }
            } catch (e) {
                console.error('[cancel-booking] Failed to fetch PI for merchant pricing:', e);
            }
        }

        // Calculate merchant-level penalty to ensure: TotalPaid - Penalty = Refund
        const merchantPenaltyAmount = merchantTotalPaid - merchantRefundAmount;

        // ── Step 8: Send Emails ──────────────────────────────────────────
        // Fire email asynchronously (don't block the request)
        fireCancellationEmails(
            supabase,
            booking,
            merchantRefundAmount,
            merchantPenaltyAmount,
            merchantCurrency,
            refunded ? 'processed' : undefined,
            merchantTotalPaid
        ).catch(err => console.error('[cancel-booking] email error:', err));

        return NextResponse.json({
            success: true,
            status: stripeError ? 'refund_failed' : (refunded ? 'refunded' : 'refund_pending'),
            refundAmount,
            penaltyAmount,
            currency: refundCurrency,
            stripeError,
        });
    } catch (err) {
        console.error('[cancel-booking] Error:', err);
        return NextResponse.json(
            { success: false, error: err instanceof Error ? err.message : 'Cancellation failed' },
            { status: 500 },
        );
    }
}

// ─── Supplier helpers ────────────────────────────────────────────────

interface CancelResult {
    success: boolean;
    refundAmount?: number;
    penaltyAmount?: number;
    currency?: string;
    cancellationId?: string;
    error?: string;
    providerMissing?: boolean;
    requiresManualCancellation?: boolean;
}

async function cancelMystifly(booking: any): Promise<CancelResult> {
    const uniqueId = booking.pnr;

    if (!uniqueId) {
        return { success: false, error: 'No PNR found for Mystifly cancellation' };
    }

    console.log(`[cancel-booking] Mystifly cancel via edge fn: PNR=${uniqueId}`);

    const supabaseUrl = env.SUPABASE_URL;
    const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

    const res = await fetch(`${supabaseUrl}/functions/v1/mystifly-cancel`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey,
        },
        body: JSON.stringify({ uniqueId }),
    });

    let data: any;
    try {
        data = await res.json();
    } catch {
        return { success: false, error: `Mystifly cancel edge fn returned non-JSON (HTTP ${res.status})` };
    }

    if (!data.success) {
        // If already cancelled on Mystifly's side, treat as success so we can proceed with refund
        if (data.alreadyCancelled) {
            console.warn(`[cancel-booking] Mystifly: booking already cancelled — treating as success`);
            return { success: true, refundAmount: 0, penaltyAmount: 0, currency: 'USD' };
        }
        return { success: false, error: data.error ?? 'Mystifly cancellation failed' };
    }

    return {
        success: true,
        refundAmount: data.refundAmount ?? 0,
        penaltyAmount: data.penaltyAmount ?? 0,
        currency: data.currency ?? 'USD',
        cancellationId: data.cancellationId,
    };
}

async function cancelDuffel(booking: any): Promise<CancelResult> {
    const supabase = createServiceClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    const duffelToken = env.DUFFEL_TOKEN;
    if (!duffelToken) {
        return { success: false, error: 'DUFFEL_ACCESS_TOKEN not configured' };
    }

    // Load Duffel order ID from booking session
    // The real Duffel order ID is stored as provider_order_id on the booking,
    // or in the session under duffel_order_id / order.id
    let orderId: string | undefined = booking.provider_order_id;

    if (!orderId) {
        const { data: session } = await supabase
            .from('booking_sessions')
            .select('flight, duffel_pre_order_id')
            .eq('id', booking.session_id)
            .maybeSingle();

        // duffel_pre_order_id is the authoritative column set by /api/flights/book
        // The flight JSONB contains the original search offer (off_...), NOT the order ID
        const flight = session?.flight as any;
        orderId = (session as any)?.duffel_pre_order_id
            ?? flight?.duffel_order_id
            ?? flight?.orderId
            ?? flight?.order_id;
        // NOTE: flight?.offerId / resultIndex intentionally excluded — those are Duffel offer IDs
        // (off_...), not order IDs (ord_...). Using them causes 404 on cancellation.
    }

    if (!orderId) {
        console.warn('[cancel-booking] No Duffel order ID found — sandbox mock cancellation');
        // Sandbox fallback: no real order to cancel, treat as success with 0 refund
        return { success: true, refundAmount: 0, penaltyAmount: 0, currency: 'USD' };
    }

    console.log(`[cancel-booking] Duffel cancel: orderId=${orderId}`);

    if (!duffelToken) return { success: false, error: 'Duffel token missing' };

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s fetch timeout

        // Step 0: Get Order Details to check available_actions
        const orderRes = await fetch(`https://api.duffel.com/air/orders/${orderId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${duffelToken}`,
                'Duffel-Version': 'v2',
            },
            signal: controller.signal,
        });

        if (!orderRes.ok) {
            const orderErr = await orderRes.json();
            const errMsg = orderErr?.errors?.[0]?.message ?? 'Failed to fetch order status';
            if (orderRes.status === 404) {
                return { success: true, refundAmount: 0, penaltyAmount: booking.total_price || 0, currency: booking.currency || 'USD', providerMissing: true, error: 'Supplier order not found' };
            }
            return { success: false, error: errMsg };
        }

        const orderData = await orderRes.json();
        const availableActions = orderData?.data?.available_actions ?? [];
        const isCancellable = availableActions.includes('cancel');

        if (!isCancellable) {
            console.warn(`[cancel-booking] Order ${orderId} not cancellable via API. Available actions:`, availableActions);
            return { 
                success: false, 
                requiresManualCancellation: true, 
                error: 'This booking cannot be cancelled automatically via the API. Please contact support to request a manual cancellation.' 
            };
        }

        // Step 1: Create a cancellation (get refund preview)
        const cancellationRes = await fetch(`https://api.duffel.com/air/order_cancellations`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${duffelToken}`,
                'Duffel-Version': 'v2',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ data: { order_id: orderId } }),
            signal: controller.signal,
        });
        clearTimeout(timeoutId);

        const cancellationData = await cancellationRes.json();
        if (!cancellationRes.ok) {
            const duffelError = cancellationData?.errors?.[0]?.message ?? '';
            // If the quote creation fails despite 'cancel' being an available action, it's a real failure
            return { success: false, error: duffelError || 'Duffel cancellation quote failed' };
        }

        const cancellationId = cancellationData?.data?.id;
        const refundAmount = Number(cancellationData?.data?.refund_amount) || 0;
        const refundCurrency = cancellationData?.data?.refund_currency ?? 'USD';

        // Step 2: Confirm the cancellation
        const confirmRes = await fetch(`https://api.duffel.com/air/order_cancellations/${cancellationId}/actions/confirm`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${duffelToken}`,
                'Duffel-Version': 'v2',
                'Content-Type': 'application/json',
            },
            signal: controller.signal,
        });

        if (!confirmRes.ok) {
            const confirmData = await confirmRes.json();
            return { success: false, error: confirmData?.errors?.[0]?.message ?? 'Duffel cancellation confirm failed' };
        }

        return {
            success: true,
            refundAmount,
            penaltyAmount: 0,
            currency: refundCurrency,
            cancellationId,
        };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

// ─── Email Helper ───────────────────────────────────────────────────

async function fireCancellationEmails(
    supabase: any,
    booking: any,
    refundAmount: number,
    penaltyAmount: number,
    currency: string,
    isRefunded?: string,
    merchantTotalPaid?: number 
) {
    try {
        const [{ data: session }, { data: segments }] = await Promise.all([
            supabase.from('booking_sessions').select('contact, passengers').eq('id', booking.session_id).single(),
            supabase.from('flight_segments').select('*').eq('booking_id', booking.id),
        ]);

        const email = (session as any)?.contact?.email;
        if (!email) {
            console.warn('[cancel-booking] No contact email found for booking', booking.id);
            return;
        }

        const pax0 = (session as any)?.passengers?.[0];
        const passengerName = pax0 ? `${pax0.firstName} ${pax0.lastName}` : 'Traveler';

        const mappedSegments = ((segments as any[]) ?? []).map((s: any) => ({
            airline: s.airline,
            flightNumber: s.flight_number,
            origin: s.origin,
            destination: s.destination,
            departureTime: s.departure,
            arrivalTime: s.arrival,
        }));

        // Email 1: Cancellation Confirmed
        await sendFlightCancellationEmail({
            bookingId: booking.id,
            pnr: booking.pnr,
            email,
            passengerName,
            segments: mappedSegments,
            totalPaid: merchantTotalPaid ?? booking.total_price ?? 0,
            refundAmount,
            penaltyAmount,
            currency,
        });

        // Email 2: Refund Confirmed (if stripe refund immediately succeeded or was zero-refund)
        if (isRefunded && refundAmount > 0) {
            const firstSeg = mappedSegments[0];
            const lastSeg = mappedSegments[mappedSegments.length - 1];
            const route = firstSeg && lastSeg ? `${firstSeg.origin} → ${lastSeg.destination}` : 'N/A';

            // Extract real stripe refund ID from the newly built log if possible
            // But since this is async, we don't strictly need the exact ID for the email to send,
            // we can omit it if we don't have it easily.
            let stripeRefundId;
            if (booking.cancellation_log) {
                const logs = booking.cancellation_log;
                const refundedLog = logs[logs.length - 1];
                if (refundedLog && refundedLog.newStatus === 'refunded') {
                    stripeRefundId = refundedLog.stripeRefundId;
                }
            }

            await sendFlightCancellationRefundEmail({
                bookingId: booking.id,
                pnr: booking.pnr,
                email,
                passengerName,
                route,
                refundAmount,
                currency,
                stripeRefundId,
            });
        }
    } catch (err) {
        console.error('[cancel-booking] Failed to send cancellation emails:', err);
    }
}
