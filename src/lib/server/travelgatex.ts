/**
 * TravelgateX gateway — server-side only.
 * All hotel operations are implemented as Next.js API routes under /api/fn/travelgatex-*.
 * This file provides typed wrappers that call those routes internally.
 */

import { tgxGraphQL, getTgxSettings, buildOccupancies, normalizeOption, type TgxOption } from '@/lib/server/stays/travelgatex/client';
import { runTgxSearch, type TgxSearchParams } from '@/lib/server/stays/travelgatex/search';

// ─── Direct TGX Quote (in-process, no HTTP self-call) ────────────────────────

const TGX_QUOTE_QUERY = `
query TgxQuote($criteria: HotelCriteriaQuoteInput!, $settings: HotelSettingsInput!) {
  hotelX {
    quote(criteria: $criteria, settings: $settings) {
      optionQuote {
        optionRefId hotelCode boardCode paymentType status
        price { currency net gross }
        surcharges { chargeType mandatory price { net gross currency } }
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

async function callTgxQuoteDirect(token: string) {
    // OTV's stated Quote timeout is 55,000 ms — this must match, or a quote the
    // supplier is still legitimately working on gets aborted and the customer is
    // told the room is unavailable. This used to call getTgxSettings() with no
    // arguments and silently inherit the 18,000 ms default: under a third of the
    // budget, and out of step with /api/fn/travelgatex-quote, which had 55,000 ms
    // all along. HTTP abort sits 2 s above the supplier timeout so TGX gets to
    // return its own error rather than us hanging up first.
    const settings = getTgxSettings(undefined, 55_000);
    const result = await tgxGraphQL(TGX_QUOTE_QUERY, {
        criteria: { optionRefId: token },
        settings,
    }, 57_000);
    const quote = result?.data?.hotelX?.quote?.optionQuote;
    const errors: any[] = result?.data?.hotelX?.quote?.errors || [];
    if (errors.length) {
        const msg = errors.map((e: any) => e.description || e.code).join('; ');
        throw new Error(msg);
    }
    if (!quote) throw new Error('No quote returned from TravelgateX');
    return {
        success: true,
        data: {
            optionRefId:  quote.optionRefId || token,
            hotelCode:    quote.hotelCode,
            boardCode:    quote.boardCode,
            paymentType:  quote.paymentType,
            status:       quote.status,
            price: {
                net:      quote.price?.net   ?? 0,
                gross:    quote.price?.gross ?? 0,
                currency: quote.price?.currency ?? 'USD',
            },
            surcharges:   quote.surcharges ?? [],
            rooms:        quote.rooms ?? [],
            cancelPolicy: quote.cancelPolicy,
        },
    };
}

// ─── Re-export helpers for routes that call TGX directly ─────────────────────
export { tgxGraphQL, getTgxSettings, buildOccupancies, normalizeOption };
export type { TgxOption };

// ─── Internal route caller ────────────────────────────────────────────────────

async function callInternalRoute(path: string, body: object) {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const secret = process.env.FUNCTIONS_SECRET || process.env.INTERNAL_SECRET;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (secret) headers['Authorization'] = `Bearer ${secret}`;
    const res = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        // Prefer the route's structured `error` field so callers (and ultimately users)
        // see the real cause (e.g. "insufficient_b2b_balance") instead of the raw
        // "<path> returned <status>: {…}" envelope.
        let message = text.slice(0, 200);
        try {
            const parsed = JSON.parse(text);
            if (parsed?.error) message = String(parsed.error);
        } catch {
            // Non-JSON body — keep the raw text slice.
        }
        throw new Error(message);
    }
    return res.json();
}

// ─── Search ───────────────────────────────────────────────────────────────────

export async function searchTravelgateX(params: TgxSearchParams) {
    return runTgxSearch(params);
}

// ─── Destinations ─────────────────────────────────────────────────────────────

export async function searchTravelgateXDestinations(keyword: string) {
    return callInternalRoute('/api/fn/travelgatex-destinations', { keyword });
}

// ─── Quote ────────────────────────────────────────────────────────────────────

export async function quoteTravelgateX(params: { token: string }) {
    return callTgxQuoteDirect(params.token);
}

// ─── Book ─────────────────────────────────────────────────────────────────────

export async function bookTravelgateX(params: {
    quoteToken: string;
    clientReference: string;
    holder: { firstName: string; lastName: string; email: string };
    rooms: Array<{ occupancyRefId: number; paxes: Array<{ name: string; surname: string; age: number }> }>;
}) {
    return callInternalRoute('/api/fn/travelgatex-book', params);
}

// ─── Cancel ───────────────────────────────────────────────────────────────────

export async function cancelTravelgateX(params: {
    clientReference: string;
    supplierReference?: string;
    tgxBookingId?: string;
    hotelCode?: string;
}) {
    return callInternalRoute('/api/fn/travelgatex-cancel', params);
}
