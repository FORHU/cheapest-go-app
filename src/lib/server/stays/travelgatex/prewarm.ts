import { getSqlAdmin } from '@/lib/db/postgres';
import { runTgxSearch } from './search';

// Fallback for cold start — when hotel_search_stats has no data yet.
export const POPULAR_CITIES_LIST = [
    { cityName: 'Tokyo',     countryCode: 'JP' },
    { cityName: 'Bangkok',   countryCode: 'TH' },
    { cityName: 'Seoul',     countryCode: 'KR' },
    { cityName: 'Singapore', countryCode: 'SG' },
    { cityName: 'Paris',     countryCode: 'FR' },
    { cityName: 'London',    countryCode: 'GB' },
    { cityName: 'New York',  countryCode: 'US' },
    { cityName: 'Dubai',     countryCode: 'AE' },
    { cityName: 'Barcelona', countryCode: 'ES' },
    { cityName: 'Bali',      countryCode: 'ID' },
] as const;

export interface PrewarmCity {
    cityName:    string;
    countryCode: string;
}

export interface PrewarmResult {
    city:        string;
    status:      'fulfilled' | 'rejected';
    hotelCount?: number;
}

/**
 * Returns the top N most-searched cities from hotel_search_stats (last 30 days).
 * Falls back to POPULAR_CITIES_LIST when the table has no recent data.
 */
export async function getDemandCities(limit = 20): Promise<PrewarmCity[]> {
    try {
        const sql = getSqlAdmin();
        const rows = await sql`
            SELECT city_key, country_code
            FROM hotel_search_stats
            WHERE last_searched_at > now() - interval '30 days'
            ORDER BY search_count DESC, last_searched_at DESC
            LIMIT ${limit}
        `;
        if (rows.length > 0) {
            return rows.map((r: any) => ({ cityName: r.city_key, countryCode: r.country_code }));
        }
    } catch (e: any) {
        console.warn('[prewarm] Could not read hotel_search_stats:', e.message);
    }
    // Cold start fallback
    console.log('[prewarm] No demand data yet — using default popular cities list');
    return [...POPULAR_CITIES_LIST];
}

export async function prewarmPopularCities(
    checkIn:  string,
    checkOut: string,
    options?: { adults?: number; guest_nationality?: string; cities?: PrewarmCity[] },
): Promise<PrewarmResult[]> {
    const cities = options?.cities ?? await getDemandCities();

    const settled = await Promise.allSettled(
        cities.map(c =>
            runTgxSearch({
                cityName:          c.cityName,
                countryCode:       c.countryCode,
                checkin:           checkIn,
                checkout:          checkOut,
                adults:            options?.adults            ?? 2,
                guest_nationality: options?.guest_nationality ?? 'KR',
            }),
        ),
    );

    return settled.map((r, i) => ({
        city:       cities[i].cityName,
        status:     r.status,
        hotelCount: r.status === 'fulfilled'
            ? (Array.isArray(r.value?.data) ? r.value.data.length : 0)
            : undefined,
    }));
}
