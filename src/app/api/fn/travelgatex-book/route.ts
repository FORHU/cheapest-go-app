/**
 * POST /api/fn/travelgatex-book
 * Hotel booking — replaces the Supabase Edge Function.
 * Called from /api/booking/confirm after Stripe payment succeeds.
 *
 * deltaPrice: { percent: 0, applyBoth: false } — quote price is binding;
 * any upward drift rejects the booking.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireInternalSecret } from '@/lib/server/internalAuth';
import { tgxGraphQL, getTgxSettings } from '@/lib/server/stays/travelgatex/client';
import { startSupplierAttempt, finishSupplierAttempt } from '@/lib/server/supplierAttempt';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MUTATION = `
mutation TgxBook($input: HotelBookInput!, $settings: HotelSettingsInput!) {
  hotelX {
    book(input: $input, settings: $settings) {
      booking {
        reference { supplier client hotel }
        status
        price { currency net gross }
        hotel { hotelCode hotelName }
        cancelPolicy {
          refundable
          cancelPenalties { deadline hoursBefore penaltyType currency value }
        }
      }
      errors { code type description }
    }
  }
}`;

export async function POST(req: NextRequest) {
    const authError = requireInternalSecret(req, 'travelgatex-book');
    if (authError) return authError;
    try {
        const body = await req.json();
        const { quoteToken, clientReference, holder, rooms } = body;

        if (!quoteToken || !clientReference || !holder || !rooms?.length) {
            return NextResponse.json({
                success: false,
                error: 'quoteToken, clientReference, holder, and rooms are required',
            }, { status: 400 });
        }

        const settings = getTgxSettings(undefined, 180_000);

        const input = {
            optionRefId:     quoteToken,
            clientReference: clientReference,
            language:        'en',
            deltaPrice:      { percent: 0, applyBoth: false },
            holder: {
                name:    holder.firstName?.toUpperCase() ?? '',
                surname: holder.lastName?.toUpperCase() ?? '',
                // TGX HolderInput: email lives inside contactInfo (PaxInput has no name/surname)
                contactInfo: {
                    email: holder.email ?? '',
                },
            },
            rooms: rooms.map((r: any) => ({
                occupancyRefId: r.occupancyRefId ?? 1,
                paxes: (r.paxes || []).map((p: any) => ({
                    name:    (p.name || p.firstName || '').toUpperCase(),
                    surname: (p.surname || p.lastName || '').toUpperCase(),
                    age:     p.age ?? 30,
                })),
            })),
            // No payment field — HotelBookInput has paymentCard (for card data) but
            // MERCHANT bookings are settled supplier-side; payment type flows via context
        };

        if (process.env.NODE_ENV === 'development') {
            console.log('[travelgatex-book] input:', JSON.stringify({ ...input, optionRefId: input.optionRefId.slice(0, 60) + '…' }, null, 2));
        }

        // Opened before the mutation, closed after. This route performs the supplier call
        // but does not write the `bookings` row — that happens in confirmAndSaveTgxBooking,
        // one level up — so a caller reaching this route directly used to book real
        // inventory with no record anywhere. CG-770AZS, 2026-09-06, is what that looks like
        // from OTV's side and from ours.
        const attemptId = await startSupplierAttempt({
            provider: 'travelgatex',
            operation: 'book',
            clientReference,
            headers: req.headers,
        });

        let result: any;
        try {
            result = await tgxGraphQL(MUTATION, { input, settings }, 182_000);
        } catch (err: any) {
            // A throw here does NOT mean OTV declined — a timeout on a 180s book is at
            // least as likely to be a booking we never heard the answer to. Recorded as
            // failed with the reason, and the row stays as evidence either way.
            await finishSupplierAttempt(attemptId, { status: 'failed', error: `threw: ${err?.message}` });
            throw err;
        }

        const booking = result?.data?.hotelX?.book?.booking;
        const errors  = result?.data?.hotelX?.book?.errors || [];

        if (errors.length) {
            const msg = errors.map((e: any) => e.description || e.code).join('; ');
            console.error('[travelgatex-book] GraphQL errors:', msg);
            await finishSupplierAttempt(attemptId, { status: 'failed', error: msg });
            return NextResponse.json({ success: false, error: msg }, { status: 409 });
        }

        if (!booking) {
            await finishSupplierAttempt(attemptId, { status: 'failed', error: 'no booking returned' });
            return NextResponse.json({ success: false, error: 'No booking returned from TravelgateX' }, { status: 502 });
        }

        if (booking.status !== 'OK') {
            // Not OK is still a booking OTV knows about, so the supplier reference is
            // recorded — it is what a cancellation would have to quote.
            await finishSupplierAttempt(attemptId, {
                status: 'failed',
                error: `status ${booking.status}`,
                supplierReference: booking.reference?.supplier,
                hotelCode: booking.hotel?.hotelCode,
                hotelName: booking.hotel?.hotelName,
            });
            return NextResponse.json({
                success: false,
                error: `Booking not confirmed — status: ${booking.status}`,
                status: booking.status,
            }, { status: 409 });
        }

        await finishSupplierAttempt(attemptId, {
            status: 'confirmed',
            supplierReference: booking.reference?.supplier,
            hotelCode: booking.hotel?.hotelCode,
            hotelName: booking.hotel?.hotelName,
            priceGross: booking.price?.gross,
            currency: booking.price?.currency,
        });

        return NextResponse.json({
            success: true,
            data: {
                status:          booking.status,
                supplierRef:     booking.reference?.supplier,
                clientRef:       booking.reference?.client,
                hotelRef:        booking.reference?.hotel,
                hotelCode:       booking.hotel?.hotelCode,
                hotelName:       booking.hotel?.hotelName,
                price:           booking.price,
                cancelPolicy:    booking.cancelPolicy,
            },
        });
    } catch (err: any) {
        console.error('[travelgatex-book] Error:', err.message);
        return NextResponse.json({ success: false, error: err.message }, { status: 502 });
    }
}
