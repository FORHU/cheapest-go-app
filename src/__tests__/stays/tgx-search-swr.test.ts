/**
 * TDD – Cycle 2: stale-while-revalidate behaviour in runTgxSearch
 *
 * Mocks:
 *  - @/lib/db/postgres  → controls what the cache DB returns
 *  - @/lib/server/stays/travelgatex/client → prevents real TGX calls
 *  - @/lib/server/search → prevents real destination-code lookups
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSqlAdmin } from '@/lib/db/postgres';

vi.mock('@/lib/db/postgres', () => ({ getSqlAdmin: vi.fn() }));

vi.mock('@/lib/server/stays/travelgatex/client', () => ({
    tgxGraphQL:        vi.fn(),
    getTgxSettings:    vi.fn().mockReturnValue({}),
    getTgxConfig:      vi.fn().mockReturnValue({ accessCode: 'test', context: 'OTV', client: 'test', supplier: 'OTV' }),
    buildOccupancies:  vi.fn().mockReturnValue([{ occupancyRefId: 1, paxes: [] }]),
    normalizeOption:   vi.fn().mockImplementation((o: any) => o),
}));

vi.mock('@/lib/server/search', () => ({
    resolveTgxDestinationCode: vi.fn().mockResolvedValue(undefined),
    backgroundResolveDestCode: vi.fn(),
}));

import { runTgxSearch } from '@/lib/server/stays/travelgatex/search';
import { tgxGraphQL } from '@/lib/server/stays/travelgatex/client';
import { resolveTgxDestinationCode } from '@/lib/server/search';

// Minimal cached result shape that the client code expects
const CACHED_RESULT = {
    data: [{ hotelId: 'H1', id: 'H1', name: 'Test Hotel', price: 100, currency: 'USD' }],
    allMappable: [],
    totalCount: 1,
};

// Build a mock sql tagged-template function
function makeSql(rows: any[]) {
    const fn = vi.fn().mockResolvedValue(rows) as any;
    fn.json = vi.fn((x: any) => x);
    return fn;
}

const BASE_PARAMS = {
    cityName:          'Wichita',   // non-popular → standard TTL
    countryCode:       'US',
    checkin:           '2026-08-01',
    checkout:          '2026-08-04',
    adults:            2,
    guest_nationality: 'US',
};

beforeEach(() => {
    vi.clearAllMocks();
});

describe('runTgxSearch – fresh cache hit', () => {
    it('returns cached result without calling TGX', async () => {
        const mockSql = makeSql([{ result: CACHED_RESULT, stale: false }]);
        vi.mocked(getSqlAdmin).mockReturnValue(mockSql);

        const result = await runTgxSearch({ ...BASE_PARAMS });

        expect(result).toEqual(CACHED_RESULT);
        expect(tgxGraphQL).not.toHaveBeenCalled();
    });
});

describe('runTgxSearch – stale cache hit (SWR)', () => {
    it('returns stale result immediately without waiting for TGX', async () => {
        // First call: cache miss for tgx_failed_dest_codes load, then stale hit
        const mockSql = makeSql([{ result: CACHED_RESULT, stale: true }]);
        vi.mocked(getSqlAdmin).mockReturnValue(mockSql);

        const result = await runTgxSearch({ ...BASE_PARAMS, cityName: 'WichitaSWR' });

        // Should get the stale result back synchronously (no await on TGX)
        expect(result).toEqual(CACHED_RESULT);
    });

    it('fires a background TGX refresh after returning stale result', async () => {
        vi.mocked(resolveTgxDestinationCode).mockResolvedValue('850');
        vi.mocked(tgxGraphQL).mockResolvedValue({
            data: { hotelX: { search: { options: [], errors: [] } } },
        });

        // sql mock: first call is for failed_dest_codes load (returns []),
        // second call is the stale cache read, subsequent calls are cache write.
        let callCount = 0;
        const mockSql = vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) return Promise.resolve([]);                          // loadFailedDestCodes
            if (callCount === 2) return Promise.resolve([{ result: CACHED_RESULT, stale: true }]); // getHotelSearchCache
            return Promise.resolve([]);                                                // everything else
        }) as any;
        mockSql.json = vi.fn((x: any) => x);
        vi.mocked(getSqlAdmin).mockReturnValue(mockSql);

        // Use a unique city key so _backgroundRefreshing is clean
        await runTgxSearch({ ...BASE_PARAMS, cityName: 'WichitaBG' });

        // Allow microtasks + the background promise chain to advance
        await new Promise(r => setTimeout(r, 50));

        // tgxGraphQL must have been called as part of the background refresh
        expect(tgxGraphQL).toHaveBeenCalled();
    });
});

describe('runTgxSearch – cache miss', () => {
    it('calls TGX and returns live result when cache is empty', async () => {
        vi.mocked(resolveTgxDestinationCode).mockResolvedValue('999');
        vi.mocked(tgxGraphQL).mockResolvedValue({
            data: { hotelX: { search: { options: [], errors: [] } } },
        });

        let callCount = 0;
        const mockSql = vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) return Promise.resolve([]); // loadFailedDestCodes
            if (callCount === 2) return Promise.resolve([]); // getHotelSearchCache → miss
            return Promise.resolve([]);
        }) as any;
        mockSql.json = vi.fn((x: any) => x);
        vi.mocked(getSqlAdmin).mockReturnValue(mockSql);

        const result = await runTgxSearch({ ...BASE_PARAMS, cityName: 'WichitaMiss' });

        expect(tgxGraphQL).toHaveBeenCalled();
        expect(result).toBeDefined();
    });
});
