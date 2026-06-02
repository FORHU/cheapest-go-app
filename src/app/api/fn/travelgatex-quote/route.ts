/**
 * POST /api/fn/travelgatex-quote
 * Price valuation (Valuation step) — replaces the Supabase Edge Function.
 * Called from /api/booking/prebook to lock the price before Stripe checkout.
 */

import { NextRequest, NextResponse } from 'next/server';
import { tgxGraphQL, getTgxSettings } from '@/lib/server/stays/travelgatex/client';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const QUERY = `
query TgxQuote($criteria: HotelCriteriaQuoteInput!, $settings: HotelSettingsInput!) {
  hotelX {
    quote(criteria: $criteria, settings: $settings) {
      optionQuote {
        optionRefId
        hotelCode
        boardCode
        paymentType
        status
        price { currency net gross }
        token
        rooms { code description occupancyRefId }
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
        const { token } = await req.json();
        if (!token) return NextResponse.json({ success: false, error: 'token is required' }, { status: 400 });

        const settings = getTgxSettings();
        const result = await tgxGraphQL(QUERY, {
            criteria: { optionRefId: token },
            settings,
        });

        const quote = result?.data?.hotelX?.quote?.optionQuote;
        const errors = result?.data?.hotelX?.quote?.errors || [];

        if (errors.length) {
            const msg = errors.map((e: any) => e.description || e.code).join('; ');
            return NextResponse.json({ success: false, error: msg }, { status: 409 });
        }

        if (!quote) {
            return NextResponse.json({ success: false, error: 'No quote returned from TravelgateX' }, { status: 409 });
        }

        // Normalize to the shape prebook/route.ts expects
        const data = {
            optionRefId:  quote.optionRefId || quote.token || token,
            hotelCode:    quote.hotelCode,
            boardCode:    quote.boardCode,
            paymentType:  quote.paymentType,
            status:       quote.status,
            price: {
                net:      quote.price?.net   ?? 0,
                gross:    quote.price?.gross ?? 0,
                currency: quote.price?.currency ?? 'USD',
            },
            token:        quote.token,
            rooms:        quote.rooms ?? [],
            cancelPolicy: quote.cancelPolicy,
        };

        return NextResponse.json({ success: true, data });
    } catch (err: any) {
        console.error('[travelgatex-quote] Error:', err.message);
        return NextResponse.json({ success: false, error: err.message }, { status: 502 });
    }
}
