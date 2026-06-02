/**
 * Environment variable utility for safe access and validation.
 * Centralized configuration to prevent direct process.env usage.
 *
 * Key variables:
 *   - DATABASE_URL            → PostgreSQL connection string (required)
 *   - DATABASE_URL_UNPOOLED   → Direct connection for migrations (optional)
 *   - FUNCTIONS_BASE_URL      → Self-hosted edge function server (optional)
 *   - FUNCTIONS_SECRET        → Shared secret for internal function calls
 */
export const env = {
    // ── PostgreSQL ───────────────────────────────────────────────────────────
    DATABASE_URL: process.env.DATABASE_URL!,
    DATABASE_URL_UNPOOLED: process.env.DATABASE_URL_UNPOOLED,
    DATABASE_SSL: process.env.DATABASE_SSL,

    // ── Internal function calling ────────────────────────────────────────────
    FUNCTIONS_BASE_URL: process.env.FUNCTIONS_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL,
    FUNCTIONS_SECRET: process.env.FUNCTIONS_SECRET || process.env.INTERNAL_SECRET,

    // Flight Providers
    DUFFEL_TOKEN: process.env.DUFFEL_ACCESS_TOKEN!,
    MYSTIFLY_USERNAME: process.env.MYSTIFLY_USERNAME!,
    MYSTIFLY_PASSWORD: process.env.MYSTIFLY_PASSWORD!,
    MYSTIFLY_ACCOUNT_NUMBER: process.env.MYSTIFLY_ACCOUNT_NUMBER!,
    MYSTIFLY_BASE_URL: process.env.MYSTIFLY_BASE_URL || 'https://restapidemo.myfarebox.com',
    MYSTIFLY_ENV: process.env.MYSTIFLY_ENV || 'Production',
    MYSTIFLY_NATIONALITY: process.env.MYSTIFLY_NATIONALITY || 'US',
    MYSTIFLY_PRICING_SOURCE_TYPE: process.env.MYSTIFLY_PRICING_SOURCE_TYPE || 'All',

    // Stripe
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY!,
    STRIPE_PUBLIC_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,

    // Mapbox
    MAPBOX_TOKEN: process.env.NEXT_PUBLIC_MAPBOX_TOKEN!,

    // Resend
    RESEND_API_KEY: process.env.RESEND_API_KEY,

    // Google Places
    GOOGLE_PLACES_API_KEY: process.env.GOOGLE_PLACES_API_KEY,


    // Site
    SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || 'https://k-travel-booking.vercel.app',

    //Onda
    ONDA_SECRET_KEY: process.env.ONDA_SECRET_KEY,

    // Markup pricing (see src/lib/pricing.ts for full documentation)
    // FLIGHT_MARKUP_PERCENTAGE: 8%  — keep low; flights are price-transparent vs Google Flights
    // HOTEL_MARKUP_PERCENTAGE:  15% — OTA standard; hotel prices are opaque across platforms
    FLIGHT_MARKUP_PERCENTAGE: process.env.FLIGHT_MARKUP_PERCENTAGE || '0.08',
    HOTEL_MARKUP_PERCENTAGE: process.env.HOTEL_MARKUP_PERCENTAGE || '0.15',
    // TravelgateX
    TRAVELGATE_API_KEY: process.env.TRAVELGATEX_API_KEY || process.env.TRAVELGATE_API_KEY,
    TRAVELGATE_CODE: process.env.TRAVELGATEX_CODE || process.env.TRAVELGATE_CODE,
    TRAVELGATE_ENDPOINT_URL: process.env.TRAVELGATEX_ENDPOINT_URL || process.env.TRAVELGATE_ENDPOINT_URL,
    TRAVELGATE_CLIENT: process.env.TRAVELGATEX_CLIENT || 'forhuinc',
    TRAVELGATE_SUPPLIER: process.env.TRAVELGATEX_SUPPLIER || 'OTV',
    TRAVELGATE_CONTEXT: process.env.TRAVELGATEX_CONTEXT || 'OTV',
    // Foursquare
    FOURSQUARE_API_KEY: process.env.FOURSQUARE_SERVICE_API_KEY,

    // ETG / RateHawk B2B (hotel reviews nightly sync)
    ETG_KEY_ID: process.env.ETG_KEY_ID,
    ETG_API_KEY: process.env.ETG_API_KEY,

    // Mobile API — shared secret for /api/mobile/* endpoints
    MOBILE_API_KEY: process.env.MOBILE_API_KEY!,
    MOBILE_GUEST_USER_ID: process.env.MOBILE_GUEST_USER_ID,

    // Sentry error monitoring
    SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
};

/**
 * Helper to get a required environment variable with a helpful error message.
 */
export function getRequiredEnv(key: keyof typeof env): string {
    const value = env[key];
    if (!value) {
        throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
}
