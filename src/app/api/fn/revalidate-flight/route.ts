/**
 * POST /api/fn/revalidate-flight
 * Checks current price and availability for a flight offer before checkout.
 * Replaces the Supabase Edge Function of the same name.
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 20;

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { provider, flightPayload } = body;
        const { oldPrice, currency, traceId, flight } = flightPayload ?? {};

        // ── Duffel ────────────────────────────────────────────────────────────
        if (provider === 'duffel' || (!provider && flight)) {
            const offerId = flight?.id ?? flight?.offer_id;
            if (!offerId) {
                return NextResponse.json({ success: true, seatsAvailable: true, newPrice: oldPrice });
            }

            const token = process.env.DUFFEL_ACCESS_TOKEN;
            if (!token) {
                console.error('[revalidate-flight] DUFFEL_ACCESS_TOKEN not set');
                return NextResponse.json({ success: true, seatsAvailable: true, newPrice: oldPrice });
            }

            const headers = {
                'Authorization': `Bearer ${token}`,
                'Duffel-Version': 'v2',
                'Content-Type': 'application/json',
                'Idempotency-Key': crypto.randomUUID(),
            };

            // Live price action — gets current price and availability
            const res = await fetch(`https://api.duffel.com/air/offers/${offerId}/actions/price`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ data: {} }),
                signal: AbortSignal.timeout(12_000),
            });

            if (!res.ok) {
                const errText = await res.text().catch(() => '');
                console.warn('[revalidate-flight] Duffel price action failed:', res.status, errText.slice(0, 200));
                // Soft-pass — let booking attempt handle it
                return NextResponse.json({ success: true, seatsAvailable: true, newPrice: oldPrice });
            }

            const data = await res.json();
            const pricedOffer = data?.data;
            if (!pricedOffer) {
                return NextResponse.json({ success: true, seatsAvailable: true, newPrice: oldPrice });
            }

            const newPrice = parseFloat(pricedOffer.total_amount ?? oldPrice);
            const priceChanged = Math.abs(newPrice - (oldPrice ?? 0)) > 0.01;
            const seatsRemaining = pricedOffer.available_seats ?? null;

            const refundCond  = pricedOffer.conditions?.refund_before_departure;
            const changeCond  = pricedOffer.conditions?.change_before_departure;
            const farePolicy = {
                isRefundable:   refundCond?.allowed === true,
                refundPenalty:  refundCond?.penalty_amount ?? null,
                isChangeable:   changeCond?.allowed === true,
                changePenalty:  changeCond?.penalty_amount ?? null,
            };

            return NextResponse.json({
                success:       true,
                seatsAvailable: true,
                newPrice,
                priceChanged,
                seatsRemaining,
                farePolicy,
                // Return the updated raw offer so the client can store it
                updatedOffer: pricedOffer,
            });
        }

        // Mystifly not yet onboarded — soft-pass
        return NextResponse.json({ success: true, seatsAvailable: true, newPrice: oldPrice });

    } catch (err: any) {
        console.error('[revalidate-flight] Error:', err.message);
        // Soft-pass on unexpected errors — let the booking step validate
        return NextResponse.json({ success: true, seatsAvailable: true });
    }
}
