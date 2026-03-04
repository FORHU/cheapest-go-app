import Stripe from 'stripe';

// Lazy-initialised so Vercel's build-time page-data collection (which imports
// every route module) doesn't throw when STRIPE_SECRET_KEY is absent.
let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
    if (!_stripe) {
        const key = process.env.STRIPE_SECRET_KEY;
        if (!key) throw new Error('STRIPE_SECRET_KEY is missing');
        _stripe = new Stripe(key, {
            apiVersion: '2025-02-24.acacia' as any,
        });
    }
    return _stripe;
}

// Backwards-compat named export used by existing route files.
// This is a getter so it stays lazy.
export const stripe = new Proxy({} as Stripe, {
    get(_target, prop) {
        return (getStripe() as any)[prop];
    },
});
