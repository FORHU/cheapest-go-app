/**
 * ─── Markup & Pricing Strategy ────────────────────────────────────────────────
 *
 * CheapestGo earns revenue by charging customers a marked-up price while paying
 * providers (Duffel, Mystifly, future hotel providers) the raw fare.
 * The difference — minus Stripe processing fees — is our profit margin.
 *
 * ## Why different rates for flights vs hotels?
 *
 * FLIGHTS — 8% markup
 *   Flight prices are highly transparent. Google Flights, Kayak, and Skyscanner
 *   show the exact airline fare with zero markup. Any user can do a side-by-side
 *   comparison in seconds. A large markup would directly contradict the "cheapest"
 *   brand promise and push customers to book direct or via aggregators.
 *
 *   Industry reference:
 *     - Google Flights / Kayak / Skyscanner: $0 markup (aggregators, redirect to airline)
 *     - Expedia / Booking.com flights: ~$15–25 flat fee (not percentage)
 *     - Traditional OTAs: 8–12% (Priceline, Orbitz)
 *
 *   At 8%, net margin after Stripe fees (~2.9% + $0.30) is approximately:
 *     $500 flight → $540 charged → ~$23 net profit
 *     $800 flight → $864 charged → ~$39 net profit
 *
 * HOTELS — 15% markup
 *   Hotel prices are opaque. Rates differ by platform due to inventory contracts,
 *   dynamic pricing, loyalty tiers, and availability windows. Customers rarely
 *   know the "true" price, so a 15% margin is standard and invisible to the user.
 *
 *   Industry reference:
 *     - Booking.com: 15–25% commission from hotels (passed as higher room rate)
 *     - Agoda: 15–20%
 *     - Expedia: 15–30%
 *     - Airbnb: 14–16% guest fee + 3% host fee
 *
 *   At 15%, net margin after Stripe fees is approximately:
 *     $300 hotel (3 nights) → $345 charged → ~$34 net profit
 *     $600 hotel (5 nights) → $690 charged → ~$72 net profit
 *
 * ## How it works technically
 *
 *   1. Provider prices the fare at e.g. $500 (original cost).
 *   2. We multiply by (1 + MARKUP_RATE) to get the customer price ($540).
 *   3. Stripe charges the customer $540.
 *   4. We pay the provider $500 from our Duffel balance / Mystifly account.
 *   5. We keep the $40 difference, minus Stripe's ~$16.96 fee = ~$23 profit.
 *
 *   Both the original price and the charged price are stored in the DB so
 *   finance reporting always has an accurate margin view.
 *
 * ## Future: Bundles (flight + hotel)
 *   When bundled booking is implemented, use a blended rate (~12%) applied to
 *   the total. This gives a slightly higher effective margin than flights alone
 *   while remaining competitive against package-deal OTAs.
 *
 * ─── Changing rates ───────────────────────────────────────────────────────────
 *
 *   Override via environment variables (no code change needed):
 *     FLIGHT_MARKUP_PERCENTAGE=0.08    # 8%
 *     HOTEL_MARKUP_PERCENTAGE=0.15     # 15%
 *     BUNDLE_MARKUP_PERCENTAGE=0.12    # 12% — not yet active
 *
 *   Rates are clamped between 0 and 0.50 (50%) to prevent misconfiguration
 *   from charging customers absurd prices.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Default rates (overridable via env) ─────────────────────────────────────

/** 8% — flights are price-transparent; must stay competitive vs Google Flights */
export const FLIGHT_MARKUP = parseMarkupEnv('FLIGHT_MARKUP_PERCENTAGE', 0.08);

/** 15% — hotels are price-opaque; aligns with industry OTA standard */
export const HOTEL_MARKUP = parseMarkupEnv('HOTEL_MARKUP_PERCENTAGE', 0.15);

/** 12% — blended rate for future flight+hotel bundles */
export const BUNDLE_MARKUP = parseMarkupEnv('BUNDLE_MARKUP_PERCENTAGE', 0.12);

// ── Stripe fee constants ─────────────────────────────────────────────────────

/** Stripe percentage fee per transaction (2.9%) */
export const STRIPE_RATE = 0.029;

/** Stripe flat fee per transaction in major currency units (USD $0.30, GBP £0.20, etc.) */
export const STRIPE_FLAT_FEE = 0.30;

// ── Core functions ───────────────────────────────────────────────────────────

/**
 * Apply a markup rate to a base price.
 *
 * @param basePrice  - Raw provider fare (what we pay the supplier)
 * @param markupRate - Decimal markup (e.g. 0.08 for 8%)
 * @returns          - Object with both the original and marked-up price
 *
 * @example
 *   const { originalPrice, chargedPrice, markupAmount } = applyMarkup(500, FLIGHT_MARKUP);
 *   // originalPrice: 500, chargedPrice: 540, markupAmount: 40
 */
export function applyMarkup(basePrice: number, markupRate: number): {
    originalPrice: number;
    chargedPrice: number;
    markupAmount: number;
    markupRate: number;
} {
    const chargedPrice = round2(basePrice * (1 + markupRate));
    return {
        originalPrice: round2(basePrice),
        chargedPrice,
        markupAmount: round2(chargedPrice - basePrice),
        markupRate,
    };
}

/**
 * Convert a price to the integer amount Stripe expects.
 *
 * Stripe uses the smallest currency unit (cents for USD/EUR/GBP, etc.).
 * Zero-decimal currencies (JPY, KRW, etc.) are passed as-is.
 *
 * @param price    - Price in major currency units (e.g. 540.00 USD)
 * @param currency - ISO 4217 currency code (case-insensitive)
 * @returns        - Integer amount for Stripe `amount` field
 */
export function toStripeAmount(price: number, currency: string): number {
    return ZERO_DECIMAL_CURRENCIES.has(currency.toLowerCase())
        ? Math.round(price)
        : Math.round(price * 100);
}

/**
 * Estimate net profit after applying markup and deducting Stripe fees.
 * Useful for finance reporting — not used in the payment flow itself.
 *
 * @param basePrice  - Raw provider fare
 * @param markupRate - Decimal markup applied
 * @returns          - Approximate net profit after Stripe fees
 */
export function estimateNetProfit(basePrice: number, markupRate: number): number {
    const { chargedPrice, markupAmount } = applyMarkup(basePrice, markupRate);
    const stripeFee = calculateStripeFee(chargedPrice);
    return round2(markupAmount - stripeFee);
}

/**
 * Calculate Stripe fees for a given charged price.
 *
 * @param chargedPrice - Amount the customer actually paid
 * @returns - Stripe fee amount
 */
export function calculateStripeFee(chargedPrice: number): number {
    return round2(chargedPrice * STRIPE_RATE + STRIPE_FLAT_FEE);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Currencies where Stripe expects the amount in whole units (no cents) */
const ZERO_DECIMAL_CURRENCIES = new Set([
    'bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga',
    'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf',
]);

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

/**
 * Read a markup rate from an environment variable.
 * Clamps to [0, 0.50] to prevent misconfiguration from overcharging customers.
 */
function parseMarkupEnv(key: string, defaultValue: number): number {
    const raw = process.env[key];
    if (!raw) return defaultValue;
    const parsed = parseFloat(raw);
    if (isNaN(parsed)) return defaultValue;
    return Math.max(0, Math.min(0.50, parsed));
}
