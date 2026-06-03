/**
 * TravelgateX gateway — server-side only.
 * All hotel operations are implemented as Next.js API routes under /api/fn/travelgatex-*.
 * This file provides typed wrappers that call those routes internally.
 */

import { tgxGraphQL, getTgxSettings, buildOccupancies, normalizeOption, type TgxOption } from '@/lib/server/stays/travelgatex/client';
import { runTgxSearch, type TgxSearchParams } from '@/lib/server/stays/travelgatex/search';

// ─── Re-export helpers for routes that call TGX directly ─────────────────────
export { tgxGraphQL, getTgxSettings, buildOccupancies, normalizeOption };
export type { TgxOption };

// ─── Internal route caller ────────────────────────────────────────────────────

async function callInternalRoute(path: string, body: object) {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const res = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`${path} returned ${res.status}: ${text.slice(0, 200)}`);
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
    const result = await callInternalRoute('/api/fn/travelgatex-quote', params);
    if (!result.success) throw new Error(result.error || 'TGX quote failed');
    return result;
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
