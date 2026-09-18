/**
 * A search carries its dates whichever spelling the caller used.
 *
 * `/api/search/stream` and `/api/fn/travelgatex-search` both forward the request body straight
 * into `runTgxSearch`, and the browser sends `checkIn`/`checkOut`. The search destructured
 * `checkin`/`checkout` only, so those callers searched with **no dates at all**.
 *
 * What that looked like: TGX rejects a criteria with no dates outright, the catch that logs it
 * truncates the message to `Variable "$criteria" got invalid value { occupancies`, the search
 * falls through to the hotel-code path, fails there too, and returns Unanswered — a map full of
 * hotels with no prices, in about four seconds, with nothing on screen saying why. It reads
 * exactly like a supplier outage. The pages send lowercase, so it only ever bit callers who had
 * every reason to think they were holding it right.
 *
 * These assertions run against the real supplier call, with `tgxGraphQL` stubbed, so what is
 * checked is the criteria that would have gone over the wire.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/server/stays/travelgatex/client', async () => {
    const actual = await vi.importActual<typeof import('@/lib/server/stays/travelgatex/client')>(
        '@/lib/server/stays/travelgatex/client',
    );
    return { ...actual, tgxGraphQL: vi.fn() };
});

import { tgxGraphQL } from '@/lib/server/stays/travelgatex/client';
import { runTgxSearch } from '@/lib/server/stays/travelgatex/search';

const CHECK_IN  = '2026-09-24';
const CHECK_OUT = '2026-09-25';

/** An empty supplier answer — enough to let the call be inspected without a real search. */
const EMPTY = { data: { hotelX: { search: { options: [], errors: [] } } } };

/** Every `criteria` the search put on the wire. */
const criteriaSent = () =>
    (tgxGraphQL as unknown as ReturnType<typeof vi.fn>).mock.calls
        .map((call) => (call[1] as { criteria?: Record<string, unknown> })?.criteria)
        .filter((c): c is Record<string, unknown> => !!c);

beforeEach(() => {
    vi.clearAllMocks();
    (tgxGraphQL as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(EMPTY);
});

describe('runTgxSearch date spelling', () => {
    it('sends the dates when the caller used camelCase', async () => {
        await runTgxSearch({
            checkin: '', checkout: '',
            checkIn: CHECK_IN, checkOut: CHECK_OUT,
            hotelCode: '31810',
            bypassCache: true,
        } as Parameters<typeof runTgxSearch>[0]).catch(() => { /* the answer is not what is under test */ });

        const sent = criteriaSent();
        expect(sent.length, 'no supplier call was made').toBeGreaterThan(0);
        for (const criteria of sent) {
            expect(criteria.checkIn).toBe(CHECK_IN);
            expect(criteria.checkOut).toBe(CHECK_OUT);
        }
    });

    it('still sends them when the caller used lowercase', async () => {
        await runTgxSearch({
            checkin: CHECK_IN, checkout: CHECK_OUT,
            hotelCode: '31810',
            bypassCache: true,
        } as Parameters<typeof runTgxSearch>[0]).catch(() => { /* as above */ });

        for (const criteria of criteriaSent()) {
            expect(criteria.checkIn).toBe(CHECK_IN);
            expect(criteria.checkOut).toBe(CHECK_OUT);
        }
    });

    it('never puts a criteria with no dates on the wire', async () => {
        // The shape TGX rejects, and the one that produced the truncated error.
        await runTgxSearch({
            checkin: '', checkout: '',
            checkIn: CHECK_IN, checkOut: CHECK_OUT,
            hotelCode: '31810',
            bypassCache: true,
        } as Parameters<typeof runTgxSearch>[0]).catch(() => { /* as above */ });

        for (const criteria of criteriaSent()) {
            expect(criteria.checkIn, 'a dateless criteria reached the supplier').toBeTruthy();
            expect(criteria.checkOut, 'a dateless criteria reached the supplier').toBeTruthy();
        }
    });
});
