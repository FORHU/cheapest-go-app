/**
 * Unanswered Search vs No-Availability — see CONTEXT.md.
 *
 * A city search that ends with zero hotels means one of two very different things:
 *
 *   - the supplier answered and reported no inventory  → No-Availability, prune the catalog
 *   - the supplier never answered at all               → Unanswered, KEEP the catalog
 *
 * Every TGX call inside runCityFallback is wrapped in a catch, so before this the
 * second case was indistinguishable from the first: a 25s supplier timeout returned
 * an empty result, `tgxFailed` stayed false, and the client wiped a screen full of
 * real hotels and told the user the destination had no availability. The user's
 * workaround was to search again, which worked once the caches had warmed.
 *
 * Mocks mirror tgx-search-swr.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSqlAdmin } from '@/lib/db/postgres';

vi.mock('@/lib/db/postgres', () => ({ getSqlAdmin: vi.fn() }));

vi.mock('@/lib/server/stays/travelgatex/client', () => ({
    tgxGraphQL:         vi.fn(),
    getTgxSettings:     vi.fn().mockReturnValue({}),
    getTgxConfig:       vi.fn().mockReturnValue({ accessCode: 'test', context: 'OTV', client: 'test', supplier: 'OTV' }),
    getTgxFilterSearch: vi.fn().mockReturnValue({}),
    buildOccupancies:   vi.fn().mockReturnValue([{ occupancyRefId: 1, paxes: [] }]),
    normalizeOption:    vi.fn().mockImplementation((o: any) => o),
}));

vi.mock('@/lib/server/search', () => ({
    resolveTgxDestinationCode: vi.fn().mockResolvedValue(undefined),
    backgroundResolveDestCode: vi.fn().mockResolvedValue(undefined),
}));

import { runTgxSearch, UnansweredSearchError } from '@/lib/server/stays/travelgatex/search';
import { tgxGraphQL, getTgxSettings } from '@/lib/server/stays/travelgatex/client';
import { resolveTgxDestinationCode } from '@/lib/server/search';

const BASE_PARAMS = {
    countryCode:       'US',
    checkin:           '2026-08-01',
    checkout:          '2026-08-04',
    adults:            2,
    guest_nationality: 'US',
};

/** sql mock: loadFailedDestCodes → [], cache read → miss, everything else → []. */
function mockEmptyDb() {
    const fn = vi.fn().mockResolvedValue([]) as any;
    fn.json  = vi.fn((x: any) => x);
    fn.array = vi.fn((x: any) => x);
    vi.mocked(getSqlAdmin).mockReturnValue(fn);
    return fn;
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('Unanswered Search — the supplier never answered', () => {
    it('throws UnansweredSearchError when the destination-code search times out and there is no catalog to fall back on', async () => {
        mockEmptyDb();
        vi.mocked(resolveTgxDestinationCode).mockResolvedValue('7001');
        vi.mocked(tgxGraphQL).mockRejectedValue(
            Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }),
        );

        await expect(
            runTgxSearch({ ...BASE_PARAMS, cityName: 'UnansweredTimeout' }),
        ).rejects.toBeInstanceOf(UnansweredSearchError);
    });

    it('names the city and the failing path so the log says which supplier call was lost', async () => {
        mockEmptyDb();
        vi.mocked(resolveTgxDestinationCode).mockResolvedValue('7002');
        vi.mocked(tgxGraphQL).mockRejectedValue(new Error('513 handler overload'));

        const err = await runTgxSearch({ ...BASE_PARAMS, cityName: 'UnansweredNamed' })
            .then(() => null)
            .catch((e: unknown) => e as UnansweredSearchError);

        expect(err).toBeInstanceOf(UnansweredSearchError);
        expect(err!.cityName).toBe('UnansweredNamed');
        expect(err!.message).toContain('dest-code 7002 threw');
    });

    it('treats ALL_PROCESSES_FAILED as unanswered — every OTV connection timed out, so nothing was learned', async () => {
        mockEmptyDb();
        vi.mocked(resolveTgxDestinationCode).mockResolvedValue('7003');
        vi.mocked(tgxGraphQL).mockResolvedValue({
            data: { hotelX: { search: { options: [], errors: [{ code: 'ALL_PROCESSES_FAILED' }] } } },
        });

        await expect(
            runTgxSearch({ ...BASE_PARAMS, cityName: 'UnansweredAllProc' }),
        ).rejects.toBeInstanceOf(UnansweredSearchError);
    });

    it('does not cache an unanswered search — rejecting skips the cache write entirely', async () => {
        const sql = mockEmptyDb();
        vi.mocked(resolveTgxDestinationCode).mockResolvedValue('7004');
        vi.mocked(tgxGraphQL).mockRejectedValue(new Error('aborted'));

        await expect(
            runTgxSearch({ ...BASE_PARAMS, cityName: 'UnansweredNoCache' }),
        ).rejects.toBeInstanceOf(UnansweredSearchError);

        // A cache write would interpolate the search key into the statement. Nothing
        // that reaches the DB may mention this city — otherwise the next user is
        // pinned to zero hotels for the whole TTL by a transient supplier blip.
        const everyStatement = sql.mock.calls.map((c: any[]) => JSON.stringify(c)).join(' ');
        expect(everyStatement).not.toContain('UnansweredNoCache');
    });
});

describe('Hotel-Code Fallback batching', () => {
    /**
     * Measured on Bangkok: 994 hotel codes in one call returned 0 hotels against OTV's
     * stated 12,000 ms budget, and 153 against 15,000 ms. OTV answers a too-large request
     * with a clean empty rather than an error, so it reads as "no availability" and the
     * catalog gets pruned. Batching is what makes the stated timeout survivable.
     */
    function mockCatalog(hotelIds: string[]) {
        const sql = vi.fn().mockImplementation((strings: TemplateStringsArray) => {
            const text = Array.isArray(strings) ? strings.join('') : '';
            // Force the NONE-sentinel path so the search goes straight to the fallback.
            if (text.includes("destination_code = 'NONE'")) return Promise.resolve([{ '?column?': 1 }]);
            if (text.includes('FROM hotel_content')) {
                // Coordinates must sit inside COUNTRY_BBOX for BASE_PARAMS.countryCode,
                // or buildCityResults filters every hotel out as confirmed wrong-country.
                return Promise.resolve(hotelIds.map(id => ({ hotel_id: id, name: `Hotel ${id}`, lat: 40.71, lng: -74.01 })));
            }
            return Promise.resolve([]);
        }) as any;
        sql.json = vi.fn((x: any) => x);
        sql.array = vi.fn((x: any) => x);
        vi.mocked(getSqlAdmin).mockReturnValue(sql);
    }

    const ids = (n: number) => Array.from({ length: n }, (_, i) => String(100000 + i));
    const emptyAnswer = { data: { hotelX: { search: { options: [], errors: [] } } } };

    it('splits 994 hotel codes into 5 calls of at most 200 rather than one oversized call', async () => {
        mockCatalog(ids(994));
        vi.mocked(resolveTgxDestinationCode).mockResolvedValue(undefined);
        vi.mocked(tgxGraphQL).mockResolvedValue(emptyAnswer);

        await runTgxSearch({ ...BASE_PARAMS, cityName: 'BatchSplit' });

        const searchCalls = vi.mocked(tgxGraphQL).mock.calls
            .filter(c => (c[1] as any)?.criteria?.hotels);
        expect(searchCalls).toHaveLength(5);
        for (const call of searchCalls) {
            expect((call[1] as any).criteria.hotels.length).toBeLessThanOrEqual(200);
        }
        // Every code must be asked about exactly once — batching must not drop hotels.
        const asked = searchCalls.flatMap(c => (c[1] as any).criteria.hotels);
        expect(new Set(asked).size).toBe(994);
    });

    it('sends every batch on OTV\'s 12 s budget', async () => {
        mockCatalog(ids(450));
        vi.mocked(resolveTgxDestinationCode).mockResolvedValue(undefined);
        vi.mocked(tgxGraphQL).mockResolvedValue(emptyAnswer);

        await runTgxSearch({ ...BASE_PARAMS, cityName: 'BatchBudget' });

        const searchCalls = vi.mocked(tgxGraphQL).mock.calls
            .filter(c => (c[1] as any)?.criteria?.hotels);
        expect(searchCalls.length).toBe(3);
        // getTgxSettings is stubbed to {} by this file's client mock, so the budget is
        // asserted on what the call site asked for rather than on the built settings.
        for (const call of vi.mocked(getTgxSettings).mock.calls) {
            expect(call[1]).toBe(12_000);
        }
        // HTTP abort must outlast the supplier timeout, or TGX's error becomes an abort.
        for (const call of searchCalls) {
            expect(call[2] as number).toBeGreaterThan(12_000);
        }
    });

    it('returns the hotels the surviving batches found when one batch fails', async () => {
        mockCatalog(ids(400));
        vi.mocked(resolveTgxDestinationCode).mockResolvedValue(undefined);
        vi.mocked(tgxGraphQL)
            .mockRejectedValueOnce(new Error('aborted'))
            .mockResolvedValue({
                data: { hotelX: { search: { options: [
                    { hotelCode: '100300', paymentType: 'MERCHANT', status: 'AVAILABLE',
                      price: { gross: 120, currency: 'USD' }, rooms: [], token: 'tk' },
                ], errors: [] } } },
            });

        const result = await runTgxSearch({ ...BASE_PARAMS, cityName: 'BatchPartial' });

        // One batch died, but a partial answer is still a real, bookable result.
        expect(result.data.length).toBeGreaterThan(0);
    });

    it('does not prune the catalog when a batch went unanswered and the rest found nothing', async () => {
        mockCatalog(ids(400));
        vi.mocked(resolveTgxDestinationCode).mockResolvedValue(undefined);
        vi.mocked(tgxGraphQL)
            .mockRejectedValueOnce(new Error('aborted'))
            .mockResolvedValue(emptyAnswer);

        // Part of the catalog was never priced, so nothing may be ruled out on its behalf.
        await expect(
            runTgxSearch({ ...BASE_PARAMS, cityName: 'BatchPartialEmpty' }),
        ).rejects.toBeInstanceOf(UnansweredSearchError);
    });

    it('reports No-Availability when every batch answers with nothing', async () => {
        mockCatalog(ids(400));
        vi.mocked(resolveTgxDestinationCode).mockResolvedValue(undefined);
        vi.mocked(tgxGraphQL).mockResolvedValue(emptyAnswer);

        const result = await runTgxSearch({ ...BASE_PARAMS, cityName: 'BatchAllEmpty' });

        expect(result.data).toEqual([]);
    });
});

describe('No-Availability — the supplier answered and had nothing', () => {
    it('returns an empty result rather than throwing, so the catalog is still pruned', async () => {
        mockEmptyDb();
        vi.mocked(resolveTgxDestinationCode).mockResolvedValue('8001');
        // Clean answer: no options, and crucially no errors.
        vi.mocked(tgxGraphQL).mockResolvedValue({
            data: { hotelX: { search: { options: [], errors: [] } } },
        });

        const result = await runTgxSearch({ ...BASE_PARAMS, cityName: 'AnsweredEmpty' });

        expect(result.data).toEqual([]);
        expect(result.totalCount).toBe(0);
    });

    it('clears the unanswered state when the dest-code path fails but the hotel-code fallback answers for the catalog', async () => {
        // Catalog lookup returns two hotels; every other statement returns [].
        const sql = vi.fn().mockImplementation((strings: TemplateStringsArray) => {
            const text = Array.isArray(strings) ? strings.join('') : '';
            if (text.includes('FROM hotel_content')) {
                return Promise.resolve([{ hotel_id: '111', lat: 1, lng: 1 }, { hotel_id: '222', lat: 1, lng: 1 }]);
            }
            return Promise.resolve([]);
        }) as any;
        sql.json = vi.fn((x: any) => x);
        sql.array = vi.fn((x: any) => x);
        vi.mocked(getSqlAdmin).mockReturnValue(sql);

        vi.mocked(resolveTgxDestinationCode).mockResolvedValue('8003');
        vi.mocked(tgxGraphQL)
            .mockRejectedValueOnce(new Error('aborted'))                                       // dest-code path dies
            .mockResolvedValue({ data: { hotelX: { search: { options: [], errors: [] } } } }); // fallback answers

        const result = await runTgxSearch({ ...BASE_PARAMS, cityName: 'FallbackAnswered' });

        // Not a throw: the catalog hotels were asked about and came back with nothing.
        expect(result.data).toEqual([]);
    });

    it('still returns normally when the supplier answers with options that are all DIRECT rather than MERCHANT', async () => {
        mockEmptyDb();
        vi.mocked(resolveTgxDestinationCode).mockResolvedValue('8002');
        vi.mocked(tgxGraphQL).mockResolvedValue({
            data: {
                hotelX: {
                    search: {
                        // DIRECT is filtered out by design — but the supplier did answer.
                        options: [{ hotelCode: '123', paymentType: 'DIRECT', status: 'AVAILABLE', price: { gross: 100 } }],
                        errors: [],
                    },
                },
            },
        });

        const result = await runTgxSearch({ ...BASE_PARAMS, cityName: 'AnsweredDirectOnly' });

        expect(result.data).toEqual([]);
    });
});
