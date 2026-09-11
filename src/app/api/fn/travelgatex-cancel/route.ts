/**
 * POST /api/fn/travelgatex-cancel
 * Hotel cancellation — replaces the Supabase Edge Function.
 * Called from /api/booking/cancel.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireInternalSecret } from '@/lib/server/internalAuth';
import { startSupplierAttempt, finishSupplierAttempt } from '@/lib/server/supplierAttempt';
import { tgxGraphQL, getTgxSettings, getTgxConfig } from '@/lib/server/stays/travelgatex/client';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MUTATION = `
mutation TgxCancel($input: HotelCancelInput!, $settings: HotelSettingsInput!) {
  hotelX {
    cancel(input: $input, settings: $settings) {
      cancellation {
        reference { supplier client hotel }
        status
        price { currency net gross }
      }
      errors { code type description }
    }
  }
}`;

export async function POST(req: NextRequest) {
    const authError = requireInternalSecret(req, 'travelgatex-cancel');
    if (authError) return authError;

    // Declared outside the try so the catch can close it. A throw is exactly when the row
    // matters most, and a row left open by a crash reads as "we asked and never found out".
    let attemptId: string | null = null;

    try {
        const { clientReference, supplierReference, tgxBookingId, hotelCode } = await req.json();

        if (!clientReference && !supplierReference && !tgxBookingId) {
            return NextResponse.json({
                success: false,
                error: 'At least one of clientReference, supplierReference, or tgxBookingId is required',
            }, { status: 400 });
        }

        const cfg = getTgxConfig();
        const settings = getTgxSettings(cfg);

        // bookingID alone is sufficient per TGX docs; accessCode+hotelCode+reference is the fallback.
        //
        // Reference order is client-first, and that is load-bearing rather than stylistic.
        // OTV rejects a cancel addressed by supplier reference with "Request not accepted by
        // supplier" while accepting the identical booking by client reference — measured
        // 2026-09-06 on reservation CG-770AZS / supplier 448577296. Every cancellation this
        // platform has ever completed went by client reference, though only by accident:
        // bookings.provider_metadata was double-encoded, so `meta?.supplierRef` read
        // undefined and this route fell through to the client branch. Fixing that encoding
        // would have switched every future cancel onto the branch that does not work, so the
        // preference is now explicit and the supplier reference is a fallback, not the default.
        const references: Array<{ label: string; reference: Record<string, string> }> = [];
        if (clientReference) references.push({ label: 'client', reference: { client: clientReference } });
        if (supplierReference) references.push({ label: 'supplier', reference: { supplier: supplierReference } });

        const attempts: Array<{ label: string; input: Record<string, any> }> = tgxBookingId
            ? [{ label: 'bookingID', input: { bookingID: tgxBookingId } }]
            : references.map(({ label, reference }) => ({
                label,
                input: {
                    accessCode: cfg.accessCode,
                    ...(hotelCode ? { hotelCode } : {}),
                    reference,
                },
            }));

        // Recorded for the same reason as the book route, and with more urgency: OTV
        // monitors cancellation rates and has raised them with us, so a cancellation this
        // platform cannot see is one it cannot account for. One row per request, not per
        // reference attempt — the loop below is a single logical cancellation tried under
        // two addressings.
        attemptId = await startSupplierAttempt({
            provider: 'travelgatex',
            operation: 'cancel',
            clientReference,
            supplierReference,
            hotelCode,
            headers: req.headers,
        });

        let cancellation: any = null;
        let lastErrorMsg = '';

        for (const attempt of attempts) {
            console.log(`[travelgatex-cancel] attempt=${attempt.label} input:`, JSON.stringify(attempt.input));
            const result = await tgxGraphQL(MUTATION, { input: attempt.input, settings });

            const errors = result?.data?.hotelX?.cancel?.errors || [];
            if (errors.length) {
                lastErrorMsg = errors.map((e: any) => e.description || e.code).join('; ');
                console.warn(`[travelgatex-cancel] attempt=${attempt.label} rejected: ${lastErrorMsg}`);
                continue;
            }

            const candidate = result?.data?.hotelX?.cancel?.cancellation;
            if (candidate) {
                cancellation = candidate;
                break;
            }
            lastErrorMsg = 'No cancellation returned from TravelgateX';
        }

        if (!cancellation && lastErrorMsg && lastErrorMsg !== 'No cancellation returned from TravelgateX') {
            // Check if already cancelled
            const alreadyCancelled = lastErrorMsg.toLowerCase().includes('cancel') || lastErrorMsg.toLowerCase().includes('not found');
            await finishSupplierAttempt(attemptId, { status: 'failed', error: lastErrorMsg });
            return NextResponse.json({ success: false, error: lastErrorMsg, alreadyCancelled }, { status: 409 });
        }

        if (!cancellation) {
            await finishSupplierAttempt(attemptId, { status: 'failed', error: 'no cancellation returned' });
            return NextResponse.json({ success: false, error: 'No cancellation returned from TravelgateX' }, { status: 502 });
        }

        if (cancellation.status !== 'CANCELLED') {
            await finishSupplierAttempt(attemptId, { status: 'failed', error: 'status ' + cancellation.status, supplierReference: cancellation.reference?.supplier });
            return NextResponse.json({
                success: false,
                error: `Cancellation not confirmed — status: ${cancellation.status}`,
                status: cancellation.status,
            }, { status: 409 });
        }

        await finishSupplierAttempt(attemptId, {
            status: 'confirmed',
            supplierReference: cancellation.reference?.supplier,
            priceGross: cancellation.price?.gross,
            currency: cancellation.price?.currency,
        });

        return NextResponse.json({
            success:        true,
            status:         cancellation.status,
            supplierRef:    cancellation.reference?.supplier,
            clientRef:      cancellation.reference?.client,
            refundAmount:   cancellation.price?.net  ?? 0,
            penaltyAmount:  0,
            currency:       cancellation.price?.currency ?? 'USD',
        });
    } catch (err: any) {
        // Reached from a throw anywhere above, including inside the attempt loop. The row
        // is closed as failed rather than left open, because an open row means "we do not
        // know" and here we do: the request ended in an exception.
        console.error('[travelgatex-cancel] Error:', err.message);
        await finishSupplierAttempt(attemptId, { status: 'failed', error: `threw: ${err?.message}` });
        return NextResponse.json({ success: false, error: err.message }, { status: 502 });
    }
}
