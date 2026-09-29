/**
 * Hotel searches are live, every time — CONTEXT.md, "Nightly Rate".
 *
 * runTgxSearch used to keep results in hotel_search_cache for 2–6 hours and then serve them
 * stale for as long again while refreshing in the background. Customers saw the replayed
 * rates on their first search — often cheap rooms long since sold — and the real ones on
 * the next, so every re-search looked like a price rise. These pin down that no saved result
 * is ever served or written, and that the one sharing kept — joining an identical search
 * already in flight — still hands everyone a live answer.
 *
 * Mocks:
 *  - @/lib/db/postgres  → a DB that holds a saved search row, to prove it is ignored
 *  - @/lib/server/stays/travelgatex/client → prevents real TGX calls
 *  - @/lib/server/search → prevents real destination-code lookups
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSqlAdmin } from '@/lib/db/postgres';

vi.mock('@/lib/db/postgres', () => ({ getSqlAdmin: vi.fn() }));

vi.mock('@/lib/server/stays/travelgatex/client', () => ({
    tgxGraphQL:           vi.fn(),
    getTgxSettings:       vi.fn().mockReturnValue({}),
    getTgxConfig:         vi.fn().mockReturnValue({ accessCode: 'test', context: 'OTV', client: 'test', supplier: 'OTV' }),
    getTgxFilterSearch:   vi.fn().mockReturnValue({}),
    buildOccupancies:     vi.fn().mockReturnValue([{ occupancyRefId: 1, paxes: [] }]),
    normalizeOption:      vi.fn().mockImplementation((o: any) => o),
    toRefundableTag:      vi.fn().mockImplementation((r: any) => (r ? 'RFN' : 'NRFN')),
}));

vi.mock('@/lib/server/search', () => ({
    resolveTgxDestinationCode: vi.fn().mockResolvedValue(undefined),
    backgroundResolveDestCode: vi.fn(),
}));

import { runTgxSearch } from '@/lib/server/stays/travelgatex/search';
import { tgxGraphQL } from '@/lib/server/stays/travelgatex/client';
import { resolveTgxDestinationCode } from '@/lib/server/search';

/** A result sitting in hotel_search_cache from an earlier search — the thing never to show. */
const SAVED_RESULT = {
    data: [{ hotelId: 'H1', id: 'H1', name: 'Test Hotel', price: 100, currency: 'USD' }],
    allMappable: [],
    totalCount: 1,
};

/**
 * A DB that answers any query naming hotel_search_cache with a fresh saved row, and every
 * other query with nothing. Records every statement's text.
 */
function dbWithSavedSearch() {
    const statements: string[] = [];
    const fn = vi.fn().mockImplementation((strings: TemplateStringsArray | string) => {
        const text = Array.isArray(strings) ? strings.join('?') : String(strings);
        statements.push(text);
        return Promise.resolve(text.includes('hotel_search_cache') ? [{ result: SAVED_RESULT, stale: false }] : []);
    }) as any;
    fn.json  = vi.fn((x: any) => x);
    fn.array = vi.fn((x: any) => x);
    vi.mocked(getSqlAdmin).mockReturnValue(fn);
    return statements;
}

const BASE_PARAMS = {
    countryCode:       'US',
    checkin:           '2026-08-01',
    checkout:          '2026-08-04',
    adults:            2,
    guest_nationality: 'US',
};

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveTgxDestinationCode).mockResolvedValue('850');
    vi.mocked(tgxGraphQL).mockResolvedValue({
        data: { hotelX: { search: { options: [], errors: [] } } },
    });
});

describe('runTgxSearch — always live', () => {
    it('asks the supplier even when an earlier result for the same search is saved', async () => {
        dbWithSavedSearch();

        const result = await runTgxSearch({ ...BASE_PARAMS, cityName: 'LiveIgnoresSaved' });

        expect(tgxGraphQL).toHaveBeenCalled();
        expect(result).not.toEqual(SAVED_RESULT);
    });

    it('never reads or writes hotel_search_cache', async () => {
        const statements = dbWithSavedSearch();

        await runTgxSearch({ ...BASE_PARAMS, cityName: 'LiveNoStore' });

        expect(statements.filter(s => s.includes('hotel_search_cache'))).toEqual([]);
    });

    it('asks again on the next search rather than replaying the last one', async () => {
        dbWithSavedSearch();

        await runTgxSearch({ ...BASE_PARAMS, cityName: 'LiveTwice' });
        const afterFirst = vi.mocked(tgxGraphQL).mock.calls.length;
        await runTgxSearch({ ...BASE_PARAMS, cityName: 'LiveTwice' });

        // The customer who searches, logs out and searches again gets the supplier again.
        expect(vi.mocked(tgxGraphQL).mock.calls.length).toBe(afterFirst * 2);
    });
});

describe('runTgxSearch — identical searches in flight together share one call', () => {
    it('joins a search already running instead of calling the supplier twice', async () => {
        dbWithSavedSearch();

        await runTgxSearch({ ...BASE_PARAMS, cityName: 'ShareBaseline' });
        const oneSearch = vi.mocked(tgxGraphQL).mock.calls.length;
        vi.mocked(tgxGraphQL).mockClear();

        const [a, b] = await Promise.all([
            runTgxSearch({ ...BASE_PARAMS, cityName: 'ShareTogether' }),
            runTgxSearch({ ...BASE_PARAMS, cityName: 'ShareTogether' }),
        ]);

        expect(vi.mocked(tgxGraphQL).mock.calls.length).toBe(oneSearch);
        expect(a).toBe(b);
    });

    it('lets prebook run its own call, for tokens minted for its request', async () => {
        dbWithSavedSearch();

        await runTgxSearch({ ...BASE_PARAMS, cityName: 'OwnBaseline' });
        const oneSearch = vi.mocked(tgxGraphQL).mock.calls.length;
        vi.mocked(tgxGraphQL).mockClear();

        await Promise.all([
            runTgxSearch({ ...BASE_PARAMS, cityName: 'OwnCall' }),
            runTgxSearch({ ...BASE_PARAMS, cityName: 'OwnCall', bypassCache: true }),
        ]);

        expect(vi.mocked(tgxGraphQL).mock.calls.length).toBe(oneSearch * 2);
    });
});
