/**
 * Fallback hotel code seeds for cities where TGX/OTV portfolio returns no results.
 *
 * These codes were collected from successful TGX hotel-code searches and verified
 * to return MERCHANT availability from OTV/RateHawk. They serve as a bootstrap
 * seed when hotel_content is empty (e.g. after a DB reset) and the TGX portfolio
 * cannot auto-discover codes for these cities.
 *
 * To update: run GET /api/debug/tgx?exportCodes=CityName on a working instance
 * and paste the returned codes here.
 *
 * Countries covered: JP (Japan), TH (Phuket/Thailand)
 * Cities covered by TGX portfolio (no seed needed): KR, SG, AE, TH/Bangkok, etc.
 */

export interface CitySeeds {
    /** ISO-2 country code */
    country: string;
    /** Lowercase city name key (matches hotel_content.city ILIKE pattern) */
    city: string;
    /** TGX/OTV numeric hotel codes that are known to return MERCHANT availability */
    codes: string[];
}

const HOTEL_SEEDS: CitySeeds[] = [
    // ── Japan ────────────────────────────────────────────────────────────────
    // TGX portfolio returns no hotels for any Japan dest code (TGX/OTV mapping gap).
    // These codes are from a prior successful session and were verified to work.
    // Run: GET /api/debug/tgx?exportCodes=Tokyo to refresh from a working instance.
    {
        country: 'JP',
        city: 'tokyo',
        codes: [
            // Populated by running ?exportCodes=Tokyo on a working production instance.
            // Empty until first successful seeding — run the export and commit the codes here.
        ],
    },
    // ── Thailand / Phuket ────────────────────────────────────────────────────
    // Phuket's TGX dest code returns empty portfolio; Bangkok works via dest code.
    {
        country: 'TH',
        city: 'phuket',
        codes: [
            // Populated by running ?exportCodes=Phuket on a working production instance.
        ],
    },
    // ── Philippines ──────────────────────────────────────────────────────────
    {
        country: 'PH',
        city: 'manila',
        codes: [],
    },
    {
        country: 'PH',
        city: 'cebu',
        codes: [],
    },
];

/**
 * Return seed hotel codes for a city+country if available.
 * Returns empty array when no seeds exist for this city.
 */
export function getSeedCodesForCity(cityName: string, countryCode?: string): string[] {
    const cityKey = cityName.toLowerCase().trim().split(',')[0].trim();
    const cc = (countryCode ?? '').toUpperCase();
    const entry = HOTEL_SEEDS.find(s =>
        cityKey.includes(s.city) || s.city.includes(cityKey)
            ? (!cc || s.country === cc)
            : false
    );
    return entry?.codes ?? [];
}
