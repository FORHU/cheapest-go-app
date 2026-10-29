/**
 * Prebook, when the supplier answers with nothing.
 *
 * An empty availability answer here is usually not an empty hotel. The supplier intermittently
 * returns an empty set with a success status and no error for every hotel and every date — the
 * **Availability Blackout** in CONTEXT.md, recurring since 2026-10-26 — and the windows are
 * short. Giving up on the first empty answer strands a guest who has already entered names, an
 * email and a phone number, and sends them to a hotel list where everything else fails too.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const search = vi.hoisted(() => vi.fn());
const quote  = vi.hoisted(() => vi.fn());

vi.mock('@/lib/server/stays/travelgatex/search', () => ({ runTgxSearch: search }));
vi.mock('@/lib/server/travelgatex', () => ({ quoteTravelgateX: quote }));
vi.mock('@/lib/server/auth', () => ({ getAuthenticatedUser: vi.fn().mockResolvedValue({ user: null }) }));
vi.mock('@/lib/server/rate-limit', () => ({
    rateLimit: vi.fn().mockResolvedValue({ success: true, remaining: 29, resetAt: Date.now() + 60_000 }),
}));
vi.mock('@/utils/postgres/admin', () => ({ createAdminClient: () => ({ from: () => ({ insert: async () => ({}) }) }) }));
vi.mock('@/lib/currency', () => ({
    convertCurrencyStrict: (n: number) => n,
    refreshExchangeRates: async () => true,
}));

import { POST } from './route';

/** A real-shaped option token: b/c are the stay in YYMMDD, d is the hotel code. */
const OFFER_ID = 'TGX:33!~|a0!~|b261104!~|c261105!~|d8713704!~|yNON_REFUNDABLE!~|qHOTEL!~|q1!~|y!~|';

const post = () => POST(new Request('http://localhost/api/booking/prebook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ offerId: OFFER_ID, currency: 'KRW' }),
}) as never);

const withRooms = { data: { roomTypes: [{ offerId: 'TGX:fresh-token', roomName: 'Standard room', rates: [{}] }] } };
const empty     = { data: { roomTypes: [] } };

describe('POST /api/booking/prebook — empty availability', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('retries rather than giving up on the first empty answer', async () => {
        // Two blackout answers, then a window opens. Before the retry this was a dead
        // checkout for a guest who had already filled the form in.
        search.mockResolvedValueOnce(empty).mockResolvedValueOnce(empty).mockResolvedValueOnce(withRooms);
        quote.mockResolvedValue({ data: { optionRefId: 'q1', paymentType: 'MERCHANT', price: { net: 100, gross: 100, currency: 'KRW' } } });

        const res = await post();

        expect(search).toHaveBeenCalledTimes(3);
        expect(res.status).not.toBe(409);
    }, 20_000);

    it('stops searching as soon as the supplier answers', async () => {
        search.mockResolvedValue(withRooms);
        quote.mockResolvedValue({ data: { optionRefId: 'q1', paymentType: 'MERCHANT', price: { net: 100, gross: 100, currency: 'KRW' } } });

        await post();

        expect(search).toHaveBeenCalledTimes(1);
    }, 20_000);

    it('does not tell the guest to pick another hotel when every hotel is failing', async () => {
        // A sold-out room and a supplier serving nothing are indistinguishable from here,
        // so the copy must not send them somewhere that fails identically.
        search.mockResolvedValue(empty);

        const res = await post();
        const body = await res.json();

        expect(search).toHaveBeenCalledTimes(3);
        expect(res.status).toBe(409);
        expect(body.error).toMatch(/try again in a moment/i);
        expect(body.error).not.toMatch(/different hotel/i);
    }, 20_000);
});
