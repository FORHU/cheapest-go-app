/**
 * POST /api/fn/travelgatex-book
 * Hotel booking — replaces the Supabase Edge Function.
 * Called from /api/booking/confirm after Stripe payment succeeds.
 *
 * deltaPrice: { percent: 0, applyBoth: false } — quote price is binding;
 * any upward drift rejects the booking.
 */

import { NextRequest, NextResponse } from 'next/server';
import { tgxGraphQL, getTgxSettings } from '@/lib/server/stays/travelgatex/client';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MUTATION = `
mutation TgxBook($input: HotelCriteriaBookingInput!, $settings: HotelSettingsInput!) {
  hotelX {
    book(input: $input, settings: $settings) {
      booking {
        reference { supplier client hotel }
        status
        price { currency net gross }
        hotel { hotelCode hotelName }
        rooms {
          code description occupancyRefId refundable
          paxes { name surname age }
          price { currency net gross }
          cancelPolicy {
            refundable
            cancelPenalties { deadline hoursBefore penaltyType currency value }
          }
        }
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
    try {
        const body = await req.json();
        const { quoteToken, clientReference, holder, rooms } = body;

        if (!quoteToken || !clientReference || !holder || !rooms?.length) {
            return NextResponse.json({
                success: false,
                error: 'quoteToken, clientReference, holder, and rooms are required',
            }, { status: 400 });
        }

        const settings = getTgxSettings();

        const input = {
            optionRefId:    quoteToken,
            clientLocator:  clientReference,
            deltaPrice:     { percent: 0, applyBoth: false },
            holder: {
                name:    holder.firstName?.toUpperCase() ?? '',
                surname: holder.lastName?.toUpperCase() ?? '',
                email:   holder.email ?? '',
            },
            rooms: rooms.map((r: any) => ({
                occupancyRefId: r.occupancyRefId ?? 1,
                paxes: (r.paxes || []).map((p: any) => ({
                    name:    (p.name || p.firstName || '').toUpperCase(),
                    surname: (p.surname || p.lastName || '').toUpperCase(),
                    age:     p.age ?? 30,
                })),
            })),
            payment: { type: 'MERCHANT' },
        };

        const result = await tgxGraphQL(MUTATION, { input, settings });

        const booking = result?.data?.hotelX?.book?.booking;
        const errors  = result?.data?.hotelX?.book?.errors || [];

        if (errors.length) {
            const msg = errors.map((e: any) => e.description || e.code).join('; ');
            console.error('[travelgatex-book] GraphQL errors:', msg);
            return NextResponse.json({ success: false, error: msg }, { status: 409 });
        }

        if (!booking) {
            return NextResponse.json({ success: false, error: 'No booking returned from TravelgateX' }, { status: 502 });
        }

        if (booking.status !== 'OK') {
            return NextResponse.json({
                success: false,
                error: `Booking not confirmed — status: ${booking.status}`,
                status: booking.status,
            }, { status: 409 });
        }

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
                rooms:           booking.rooms,
                cancelPolicy:    booking.cancelPolicy,
            },
        });
    } catch (err: any) {
        console.error('[travelgatex-book] Error:', err.message);
        return NextResponse.json({ success: false, error: err.message }, { status: 502 });
    }
}
