/**
 * POST /api/fn/travelgatex-cancel
 * Hotel cancellation — replaces the Supabase Edge Function.
 * Called from /api/booking/cancel.
 */

import { NextRequest, NextResponse } from 'next/server';
import { tgxGraphQL, getTgxSettings } from '@/lib/server/stays/travelgatex/client';

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
    try {
        const { clientReference, supplierReference, tgxBookingId } = await req.json();

        if (!clientReference && !supplierReference && !tgxBookingId) {
            return NextResponse.json({
                success: false,
                error: 'At least one of clientReference, supplierReference, or tgxBookingId is required',
            }, { status: 400 });
        }

        const settings = getTgxSettings();

        // TGX cancel input: id is the booking reference (supplier or client)
        const input: Record<string, any> = {};
        if (tgxBookingId) input.id = tgxBookingId;
        else if (supplierReference) input.id = supplierReference;
        else input.clientLocator = clientReference;

        const result = await tgxGraphQL(MUTATION, { input, settings });

        const cancellation = result?.data?.hotelX?.cancel?.cancellation;
        const errors = result?.data?.hotelX?.cancel?.errors || [];

        if (errors.length) {
            const msg = errors.map((e: any) => e.description || e.code).join('; ');
            // Check if already cancelled
            const alreadyCancelled = msg.toLowerCase().includes('cancel') || msg.toLowerCase().includes('not found');
            return NextResponse.json({ success: false, error: msg, alreadyCancelled }, { status: 409 });
        }

        if (!cancellation) {
            return NextResponse.json({ success: false, error: 'No cancellation returned from TravelgateX' }, { status: 502 });
        }

        if (cancellation.status !== 'CANCELLED') {
            return NextResponse.json({
                success: false,
                error: `Cancellation not confirmed — status: ${cancellation.status}`,
                status: cancellation.status,
            }, { status: 409 });
        }

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
        console.error('[travelgatex-cancel] Error:', err.message);
        return NextResponse.json({ success: false, error: err.message }, { status: 502 });
    }
}
