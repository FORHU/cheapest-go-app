/**
 * Environment variable utility for safe access and validation.
 * Centralized configuration to prevent direct process.env usage.
 */
export const env = {
    // Supabase
    SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,

    // Flight Providers
    DUFFEL_TOKEN: process.env.DUFFEL_ACCESS_TOKEN!,
    MYSTIFLY_USERNAME: process.env.MYSTIFLY_USERNAME!,
    MYSTIFLY_PASSWORD: process.env.MYSTIFLY_PASSWORD!,
    MYSTIFLY_ACCOUNT_NUMBER: process.env.MYSTIFLY_ACCOUNT_NUMBER!,
    MYSTIFLY_BASE_URL: process.env.MYSTIFLY_BASE_URL || 'https://restapidemo.myfarebox.com',

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

    // Foursquare
    FOURSQUARE_API_KEY: process.env.FOURSQUARE_API_KEY,

    // Site
    SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || 'https://k-travel-booking.vercel.app',

    //Onda
    ONDA_SECRET_KEY: process.env.ONDA_SECRET_KEY,
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
