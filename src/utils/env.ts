/**
 * Environment variable utility for safe access and validation.
 * Senior dev implementation with type safety and build-time resilience.
 */

// Define the shape of our environment
interface EnvConfig {
    supabaseUrl: string | undefined;
    supabaseAnonKey: string | undefined;
    supabaseServiceKey: string | undefined;
    mapboxToken: string | undefined;
    stripeSecretKey: string | undefined;
    stripePublishableKey: string | undefined;
    stripeWebhookSecret: string | undefined;
}

const config: EnvConfig = {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    mapboxToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
    stripeSecretKey: process.env.STRIPE_SECRET_KEY,
    stripePublishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
};

export const env = {
    ...config,

    /**
     * Helper to get a required environment variable.
     * Throws an error if missing, except during build-time prerendering if requested.
     */
    getRequired(key: keyof EnvConfig, allowMissingInBuild = true): string {
        const value = config[key];

        if (!value) {
            const isBuild = process.env.NEXT_PHASE === 'phase-production-build' || process.env.NODE_ENV === 'production';
            
            if (isBuild && allowMissingInBuild) {
                const placeholders: Record<string, string> = {
                    supabaseUrl: 'https://placeholder-project.supabase.co',
                    supabaseAnonKey: 'placeholder-anon-key-for-build-safety',
                    mapboxToken: 'pk.ey_placeholder_token_for_build',
                    stripePublishableKey: 'pk_test_placeholder',
                };
                const placeholder = placeholders[key] || "placeholder";
                console.warn(`[env] Warning: Required environment variable "${String(key)}" is missing during build. Using placeholder: ${placeholder}`);
                return placeholder;
            }

            throw new Error(
                `[env] Error: Missing required environment variable "${String(key)}". ` +
                `Check your .env file or deployment settings.`
            );
        }

        return value;
    }
};
