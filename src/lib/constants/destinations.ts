export interface PopularDestination {
    id: string;
    city: string;
    country: string;
    countryCode: string;
    imagePath: string;
}

export const POPULAR_DESTINATIONS: PopularDestination[] = [
    // ── Philippines ────────────────────────────────────────────────────────────
    { id: 'boracay',        city: 'Boracay',          country: 'Philippines',  countryCode: 'PH', imagePath: '/images/destinations/boracay.webp' },
    { id: 'palawan',        city: 'Palawan',           country: 'Philippines',  countryCode: 'PH', imagePath: '/images/destinations/palawan.webp' },
    { id: 'siargao',        city: 'Siargao',           country: 'Philippines',  countryCode: 'PH', imagePath: '/images/destinations/siargao.webp' },
    { id: 'cebu',           city: 'Cebu',              country: 'Philippines',  countryCode: 'PH', imagePath: '/images/destinations/cebu.webp' },
    { id: 'manila',         city: 'Manila',            country: 'Philippines',  countryCode: 'PH', imagePath: '/images/destinations/manila.webp' },
    // ── Southeast Asia ─────────────────────────────────────────────────────────
    { id: 'bali',           city: 'Bali',              country: 'Indonesia',    countryCode: 'ID', imagePath: '/images/destinations/bali.webp' },
    { id: 'bangkok',        city: 'Bangkok',           country: 'Thailand',     countryCode: 'TH', imagePath: '/images/destinations/bangkok.webp' },
    { id: 'phuket',         city: 'Phuket',            country: 'Thailand',     countryCode: 'TH', imagePath: '/images/destinations/phuket.webp' },
    { id: 'singapore',      city: 'Singapore',         country: 'Singapore',    countryCode: 'SG', imagePath: '/images/destinations/singapore.webp' },
    { id: 'kuala-lumpur',   city: 'Kuala Lumpur',      country: 'Malaysia',     countryCode: 'MY', imagePath: '/images/destinations/kuala-lumpur.webp' },
    { id: 'ho-chi-minh',    city: 'Ho Chi Minh City',  country: 'Vietnam',      countryCode: 'VN', imagePath: '/images/destinations/ho-chi-minh.webp' },
    { id: 'da-nang',        city: 'Da Nang',           country: 'Vietnam',      countryCode: 'VN', imagePath: '/images/destinations/da-nang.webp' },
    // ── East Asia ──────────────────────────────────────────────────────────────
    { id: 'tokyo',          city: 'Tokyo',             country: 'Japan',        countryCode: 'JP', imagePath: '/images/destinations/tokyo.webp' },
    { id: 'osaka',          city: 'Osaka',             country: 'Japan',        countryCode: 'JP', imagePath: '/images/destinations/osaka.webp' },
    { id: 'seoul',          city: 'Seoul',             country: 'South Korea',  countryCode: 'KR', imagePath: '/images/destinations/seoul.webp' },
    { id: 'hong-kong',      city: 'Hong Kong',         country: 'Hong Kong',    countryCode: 'HK', imagePath: '/images/destinations/hong-kong.webp' },
    { id: 'taipei',         city: 'Taipei',            country: 'Taiwan',       countryCode: 'TW', imagePath: '/images/destinations/taipei.webp' },
    // ── South Asia & Oceania ───────────────────────────────────────────────────
    { id: 'maldives',       city: 'Maldives',          country: 'Maldives',     countryCode: 'MV', imagePath: '/images/destinations/maldives.webp' },
    { id: 'sydney',         city: 'Sydney',            country: 'Australia',    countryCode: 'AU', imagePath: '/images/destinations/sydney.webp' },
    { id: 'melbourne',      city: 'Melbourne',         country: 'Australia',    countryCode: 'AU', imagePath: '/images/destinations/melbourne.webp' },
];
