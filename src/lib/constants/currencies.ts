/**
 * The Charge Currency surface — the currencies a customer can actually be billed in.
 *
 * Deliberately three: Korea (via GeomeeGo), the Philippines, and USD as the fallback.
 * See CONTEXT.md → Money → Charge Currency.
 *
 * This is the single source of truth. It was previously duplicated as a bare array in
 * Navbar and as a code/country list in CurrencySelector, which could drift apart, and
 * was easily confused with three larger lists that are *not* the charge surface:
 *
 *   - EXCHANGE_RATES (18)          — rates held for admin reporting and the FX widget
 *   - create-payment's allowlist   — currencies Stripe would accept
 *   - ZERO_DECIMAL_CURRENCIES      — Stripe's minor-unit rules, a different concern
 *
 * Holding a rate for a currency does not make it chargeable. Adding one here means
 * checking it against all three of the above.
 */

export const CHARGE_CURRENCIES = [
    { code: 'KRW', country: 'KR' },
    { code: 'USD', country: 'US' },
    { code: 'PHP', country: 'PH' },
] as const;

export type ChargeCurrency = typeof CHARGE_CURRENCIES[number]['code'];

/** Just the codes, for selectors that don't need the country pairing. */
export const CHARGE_CURRENCY_CODES = CHARGE_CURRENCIES.map(c => c.code) as readonly ChargeCurrency[];

/** Whether a currency can be charged. Case-insensitive. */
export function isChargeCurrency(code: string | null | undefined): boolean {
    if (!code) return false;
    return (CHARGE_CURRENCY_CODES as readonly string[]).includes(code.toUpperCase());
}
