/**
 * POST /api/internal/revalidate-flight
 *
 * Replaces the Supabase Edge Function `functions/v1/revalidate-flight`.
 *
 * Checks whether a flight offer is still available and the price has not
 * changed beyond a tolerance threshold.
 *
 * - Mystifly:   calls /api/AirRevalidate with the FareSourceCode
 * - Duffel:     calls the Duffel Price Action (`/air/offers/{id}/actions/price`)
 *
 * Auth: Authorization: Bearer <FUNCTIONS_SECRET>
 *
 * Request body: { userId: string, provider: string, flightPayload: FlightOffer & { oldPrice?: number } }
 * Response:
 *   { success: true, seatsAvailable: true, priceChanged: false }
 *   { success: true, seatsAvailable: true, priceChanged: true, newPrice: number }
 *   { success: false, seatsAvailable: false, error: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { mystiflyRequest } from '@/lib/server/flights/mystifly-client';
import { env } from '@/utils/env';
import { getFlightPriceTolerance } from '@/lib/pricing';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Price tolerance — differences below this are treated as the same price to
// absorb rounding and dynamic-pricing micro-fluctuations. Shared with the
// order-time gate in /api/flights/book: if the two disagree, a fare between the
// thresholds passes here and is rejected there.
const PRICE_TOLERANCE = getFlightPriceTolerance();

/**
 * Should the traveller be interrupted to confirm this price?
 *
 * Only an INCREASE beyond the tolerance warrants a prompt. The comparison used
 * to be `Math.abs(new - old) > tolerance`, which stopped the booking to ask
 * someone to approve a fare that had got *cheaper* — a confirmation with no
 * decision in it, and roughly half of all observed drift.
 *
 * A drop is adopted instead of confirmed: callers take `newPrice` as the price
 * to charge, so the traveller pays the lower fare rather than the one they saw.
 */
function needsPriceConfirmation(oldPrice: number, newPrice: number): boolean {
    if (oldPrice <= 0 || newPrice <= 0) return false;
    return newPrice - oldPrice > PRICE_TOLERANCE;
}

// ── Auth helper ──────────────────────────────────────────────────────────────

function checkAuth(req: NextRequest): boolean {
    const secret = process.env.FUNCTIONS_SECRET;
    if (!secret) {
        console.warn('[revalidate-flight] FUNCTIONS_SECRET not set — allowing request (dev mode)');
        return true;
    }
    const authHeader = req.headers.get('authorization') ?? '';
    return authHeader === `Bearer ${secret}`;
}

// ── Main handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
    if (!checkAuth(req)) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    let body: { userId?: string; provider?: string; flightPayload?: any };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    const { provider, flightPayload, userId } = body;

    if (!provider || !flightPayload) {
        return NextResponse.json(
            { success: false, error: 'provider and flightPayload are required' },
            { status: 400 },
        );
    }

    // ── Mystifly ──────────────────────────────────────────────────────────
    if (provider === 'mystifly' || provider === 'mystifly_v2') {
        return await revalidateMystifly(flightPayload);
    }

    // ── Duffel ────────────────────────────────────────────────────────────
    if (provider === 'duffel') {
        return await revalidateDuffel(flightPayload);
    }

    return NextResponse.json(
        { success: false, error: `Unknown provider: ${provider}` },
        { status: 400 },
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mystifly revalidation
// ─────────────────────────────────────────────────────────────────────────────

async function revalidateMystifly(flight: any): Promise<NextResponse> {
    const traceId: string = flight.traceId ?? flight.offer_id ?? '';
    const parts = traceId.split('|');
    const fareSourceCode = parts[0] ?? traceId;
    const conversationId = parts[1] ?? '';
    const searchIdentifier = parts[3] ?? '';

    if (!fareSourceCode) {
        return NextResponse.json(
            { success: false, seatsAvailable: false, error: 'No FareSourceCode in flight data' },
        );
    }

    if (!searchIdentifier) {
        console.warn(`[revalidate-flight] Mystifly: No SearchIdentifier for FSC ${fareSourceCode.slice(0, 16)} — cannot revalidate`);
        return NextResponse.json(
            { success: false, seatsAvailable: false, error: 'SearchIdentifier is empty — cannot revalidate this fare' },
        );
    }

    const revalBody: Record<string, any> = {
        FareSourceCode: fareSourceCode,
        SearchIdentifier: searchIdentifier,
    };
    if (conversationId) revalBody.ConversationId = conversationId;

    console.log(`[revalidate-flight] Mystifly AirRevalidate FSC=${fareSourceCode.slice(0, 16)}… SearchId=${searchIdentifier.slice(0, 8)}…`);

    let revalData: any;
    try {
        revalData = await mystiflyRequest('/api/AirRevalidate', revalBody);
    } catch (err: any) {
        console.error('[revalidate-flight] Mystifly AirRevalidate error:', err.message);
        return NextResponse.json({ success: false, seatsAvailable: false, error: err.message });
    }

    if (!revalData?.Success) {
        const errMsg = revalData?.Message ?? 'Revalidation failed';
        return NextResponse.json({ success: false, seatsAvailable: false, error: errMsg });
    }

    const oldPrice: number = parseFloat(String(flight.oldPrice ?? flight.price ?? '0')) || 0;
    const newPriceRaw = revalData?.Data?.TotalFare ?? revalData?.TotalFare;
    const newPrice: number = newPriceRaw ? parseFloat(String(newPriceRaw)) : 0;

    const priceChanged = needsPriceConfirmation(oldPrice, newPrice);

    // Extract fare policy if present
    const farePolicy = extractMystiflyFarePolicy(revalData);

    console.log(`[revalidate-flight] Mystifly: oldPrice=${oldPrice} newPrice=${newPrice} priceChanged=${priceChanged}`);

    return NextResponse.json({
        success: true,
        seatsAvailable: true,
        priceChanged,
        // Always reported, not just on a confirmable change: a drop still has to
        // reach the caller so it can charge the lower fare.
        ...(newPrice > 0 ? { newPrice } : {}),
        farePolicy,
    });
}

function extractMystiflyFarePolicy(revalData: any): any {
    const data = revalData?.Data ?? revalData;
    if (!data) return null;

    return {
        isRefundable: data.IsRefundable === true || String(data.IsRefundable).toLowerCase() === 'true',
        isChangeable: false, // Mystifly does not expose this flag
        policyVersion: 'revalidated' as const,
        policySource: 'mystifly' as const,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Duffel revalidation (Price Action)
// ─────────────────────────────────────────────────────────────────────────────

async function revalidateDuffel(flight: any): Promise<NextResponse> {
    const duffelToken = env.DUFFEL_TOKEN;
    if (!duffelToken) {
        return NextResponse.json({ success: false, seatsAvailable: false, error: 'Duffel not configured' });
    }

    // Offer ID can be at flight.offer_id or flight._rawOffer.id
    const offerId: string = flight._rawOffer?.id ?? flight.offer_id ?? '';

    if (!offerId) {
        console.warn('[revalidate-flight] Duffel: no offer_id in flightPayload — skipping revalidation');
        // Soft-pass: the offer may be re-fetched at booking time
        return NextResponse.json({ success: true, seatsAvailable: true, priceChanged: false });
    }

    console.log(`[revalidate-flight] Duffel Price Action for offer ${offerId}`);

    let priceData: any;
    try {
        const res = await fetch(`https://api.duffel.com/air/offers/${offerId}/actions/price`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${duffelToken}`,
                'Duffel-Version': 'v2',
                'Content-Type': 'application/json',
                'Idempotency-Key': crypto.randomUUID(),
            },
            body: JSON.stringify({ data: {} }),
            signal: AbortSignal.timeout(12_000),
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            const errMsg = errData?.errors?.[0]?.message ?? `Duffel price action failed (HTTP ${res.status})`;
            console.error(`[revalidate-flight] Duffel Price Action failed: ${errMsg}`);

            // 404 means offer expired — unavailable
            if (res.status === 404) {
                return NextResponse.json({ success: false, seatsAvailable: false, error: 'Offer no longer available' });
            }

            // For 422 / other errors, soft-pass (booking will surface the real error)
            return NextResponse.json({ success: true, seatsAvailable: true, priceChanged: false });
        }

        priceData = await res.json();
    } catch (err: any) {
        console.error('[revalidate-flight] Duffel Price Action threw:', err.message);
        // Timeout / network error — soft-pass
        return NextResponse.json({ success: true, seatsAvailable: true, priceChanged: false });
    }

    const pricedOffer = priceData?.data;
    if (!pricedOffer) {
        return NextResponse.json({ success: true, seatsAvailable: true, priceChanged: false });
    }

    const oldPrice: number = parseFloat(String(flight.oldPrice ?? flight.price ?? '0')) || 0;
    const newPrice: number = parseFloat(pricedOffer.total_amount ?? '0');
    const priceChanged = needsPriceConfirmation(oldPrice, newPrice);

    // Extract fare policy from the refreshed offer
    const refundCond = pricedOffer.conditions?.refund_before_departure;
    const changeCond = pricedOffer.conditions?.change_before_departure;
    const farePolicy = {
        isRefundable: refundCond?.allowed === true,
        isChangeable: changeCond?.allowed === true,
        refundPenaltyAmount: refundCond?.penalty_amount != null ? parseFloat(refundCond.penalty_amount) : null,
        refundPenaltyCurrency: refundCond?.penalty_currency ?? null,
        changePenaltyAmount: changeCond?.penalty_amount != null ? parseFloat(changeCond.penalty_amount) : null,
        changePenaltyCurrency: changeCond?.penalty_currency ?? null,
        policyVersion: 'revalidated' as const,
        policySource: 'duffel' as const,
    };

    console.log(`[revalidate-flight] Duffel: oldPrice=${oldPrice} newPrice=${newPrice} priceChanged=${priceChanged}`);

    return NextResponse.json({
        success: true,
        seatsAvailable: true,
        priceChanged,
        // Always reported — see the Mystifly branch above.
        ...(newPrice > 0 ? { newPrice } : {}),
        farePolicy,
    });
}
