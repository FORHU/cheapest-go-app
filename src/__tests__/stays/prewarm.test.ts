/**
 * TDD – Cycle 3: prewarmPopularCities (demand-driven) + cold-start fallback
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/server/stays/travelgatex/search', () => ({
    runTgxSearch: vi.fn(),
    POPULAR_CITIES: new Set([
        'tokyo', 'bangkok', 'seoul', 'singapore', 'paris',
        'london', 'new york', 'dubai', 'barcelona', 'bali',
    ]),
    isPopularCity:   vi.fn(),
    getEffectiveTtl: vi.fn(),
}));

vi.mock('@/lib/db/postgres', () => ({ getSqlAdmin: vi.fn() }));

import { runTgxSearch } from '@/lib/server/stays/travelgatex/search';
import { getSqlAdmin } from '@/lib/db/postgres';
import {
    prewarmPopularCities,
    getDemandCities,
    POPULAR_CITIES_LIST,
} from '@/lib/server/stays/travelgatex/prewarm';

const CHECKIN  = '2026-08-01';
const CHECKOUT = '2026-08-04';

function makeSql(rows: any[]) {
    const fn = vi.fn().mockResolvedValue(rows) as any;
    fn.json = vi.fn((x: any) => x);
    return fn;
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(runTgxSearch).mockResolvedValue({
        data: [{ hotelId: 'H1', price: 100 }],
        allMappable: [],
        totalCount: 1,
    });
});

describe('POPULAR_CITIES_LIST', () => {
    it('contains exactly 10 cities as cold-start fallback', () => {
        expect(POPULAR_CITIES_LIST).toHaveLength(10);
    });

    it('each entry has cityName and 2-letter countryCode', () => {
        for (const city of POPULAR_CITIES_LIST) {
            expect(city.cityName.length).toBeGreaterThan(0);
            expect(city.countryCode).toHaveLength(2);
        }
    });
});

describe('getDemandCities', () => {
    it('returns cities from hotel_search_stats when data exists', async () => {
        const mockSql = makeSql([
            { city_key: 'manila',  country_code: 'PH' },
            { city_key: 'busan',   country_code: 'KR' },
        ]);
        vi.mocked(getSqlAdmin).mockReturnValue(mockSql);

        const cities = await getDemandCities();
        expect(cities).toEqual([
            { cityName: 'manila', countryCode: 'PH' },
            { cityName: 'busan',  countryCode: 'KR' },
        ]);
    });

    it('falls back to POPULAR_CITIES_LIST when stats table is empty', async () => {
        const mockSql = makeSql([]); // no demand data
        vi.mocked(getSqlAdmin).mockReturnValue(mockSql);

        const cities = await getDemandCities();
        expect(cities).toHaveLength(10);
        expect(cities[0].cityName).toBe('Tokyo');
    });

    it('falls back to POPULAR_CITIES_LIST when DB throws', async () => {
        const mockSql = vi.fn().mockRejectedValue(new Error('DB down')) as any;
        mockSql.json = vi.fn();
        vi.mocked(getSqlAdmin).mockReturnValue(mockSql);

        const cities = await getDemandCities();
        expect(cities).toHaveLength(10);
    });
});

describe('prewarmPopularCities', () => {
    it('uses demand cities from hotel_search_stats when available', async () => {
        const mockSql = makeSql([
            { city_key: 'manila', country_code: 'PH' },
            { city_key: 'osaka',  country_code: 'JP' },
        ]);
        vi.mocked(getSqlAdmin).mockReturnValue(mockSql);

        await prewarmPopularCities(CHECKIN, CHECKOUT);

        expect(runTgxSearch).toHaveBeenCalledTimes(2);
        expect(vi.mocked(runTgxSearch).mock.calls[0][0].cityName).toBe('manila');
        expect(vi.mocked(runTgxSearch).mock.calls[1][0].cityName).toBe('osaka');
    });

    it('falls back to 10 popular cities when stats table is empty', async () => {
        const mockSql = makeSql([]);
        vi.mocked(getSqlAdmin).mockReturnValue(mockSql);

        await prewarmPopularCities(CHECKIN, CHECKOUT);
        expect(runTgxSearch).toHaveBeenCalledTimes(10);
    });

    it('accepts an explicit cities list, skipping the DB lookup', async () => {
        const cities = [{ cityName: 'Cebu', countryCode: 'PH' }];
        await prewarmPopularCities(CHECKIN, CHECKOUT, { cities });

        expect(getSqlAdmin).not.toHaveBeenCalled();
        expect(runTgxSearch).toHaveBeenCalledTimes(1);
        expect(vi.mocked(runTgxSearch).mock.calls[0][0].cityName).toBe('Cebu');
    });

    it('passes checkin and checkout to every search', async () => {
        const mockSql = makeSql([{ city_key: 'tokyo', country_code: 'JP' }]);
        vi.mocked(getSqlAdmin).mockReturnValue(mockSql);

        await prewarmPopularCities(CHECKIN, CHECKOUT);
        const call = vi.mocked(runTgxSearch).mock.calls[0][0];
        expect(call.checkin).toBe(CHECKIN);
        expect(call.checkout).toBe(CHECKOUT);
    });

    it('reports rejected status when a city search throws', async () => {
        const mockSql = makeSql([
            { city_key: 'fails', country_code: 'XX' },
            { city_key: 'works', country_code: 'JP' },
        ]);
        vi.mocked(getSqlAdmin).mockReturnValue(mockSql);
        vi.mocked(runTgxSearch)
            .mockRejectedValueOnce(new Error('TGX timeout'))
            .mockResolvedValueOnce({ data: [{ hotelId: 'H1' }], allMappable: [], totalCount: 1 });

        const results = await prewarmPopularCities(CHECKIN, CHECKOUT);
        expect(results[0].status).toBe('rejected');
        expect(results[1].status).toBe('fulfilled');
    });

    it('still returns all results even when all cities fail', async () => {
        const mockSql = makeSql([{ city_key: 'x', country_code: 'XX' }]);
        vi.mocked(getSqlAdmin).mockReturnValue(mockSql);
        vi.mocked(runTgxSearch).mockRejectedValue(new Error('all fail'));

        const results = await prewarmPopularCities(CHECKIN, CHECKOUT);
        expect(results).toHaveLength(1);
        expect(results[0].status).toBe('rejected');
    });
});
