/**
 * Currency conversion utilities
 *
 * Static rates are used as the initial fallback. Call `refreshExchangeRates()`
 * on app mount to hydrate with live rates from /api/exchange-rates (Frankfurter / ECB data).
 */

// Static fallback rates (USD-per-1-unit format)
const STATIC_RATES: Record<string, number> = {
    'USD': 1.0,
    'PHP': 0.018,
    'KRW': 0.00075,
    'JPY': 0.0067,
    'EUR': 1.087,
    'GBP': 1.266,
    'AUD': 0.658,
    'SGD': 0.74,
    'MYR': 0.21,
    'THB': 0.027,
    'VND': 0.0000392,
    'IDR': 0.0000621,
    'CNY': 0.138,
    'TWD': 0.0307,
    'HKD': 0.127,
    'INR': 0.012,
    'AED': 0.272,
    'CAD': 0.73,
};

/**
 * The live exchange rates object. Starts with static values and is
 * updated in-place when `refreshExchangeRates()` succeeds.
 * All consumers of `convertCurrency()` automatically use the latest rates.
 */
export const EXCHANGE_RATES: Record<string, number> = { ...STATIC_RATES };

/** Timestamp of the last successful live rate update (0 = never). */
let _lastRefresh = 0;

/**
 * Fetch live exchange rates from /api/exchange-rates and update
 * the EXCHANGE_RATES object in-place. Safe to call multiple times;
 * skips the fetch if rates were refreshed within the last hour.
 *
 * @returns true if rates were updated, false if skipped/errored.
 */
export async function refreshExchangeRates(): Promise<boolean> {
    // Skip if refreshed within the last hour
    if (_lastRefresh && Date.now() - _lastRefresh < 60 * 60 * 1000) {
        return false;
    }

    try {
        const res = await fetch('/api/exchange-rates');
        if (!res.ok) return false;

        const json = await res.json();
        if (!json.success || !json.rates) return false;

        // Update EXCHANGE_RATES in-place so all imported references see the new values
        for (const [currency, rate] of Object.entries(json.rates as Record<string, number>)) {
            EXCHANGE_RATES[currency] = rate;
        }
        _lastRefresh = Date.now();
        return true;
    } catch {
        // Network error — keep using static/previous rates
        return false;
    }
}

/**
 * Convert amount from one currency to another
 */
export function convertCurrency(amount: number, fromCurrency: string, toCurrency: string): number {
    // Normalize currencies
    const from = fromCurrency.toUpperCase();
    const to = toCurrency.toUpperCase();

    if (from === to) return amount;

    // Get rates relative to USD
    const fromRate = EXCHANGE_RATES[from];
    const toRate = EXCHANGE_RATES[to];

    if (!fromRate || !toRate) {
        console.warn(`Exchange rate not found for ${from} or ${to}`);
        return amount; // Fallback to original amount
    }

    // Convert: (Amount * FromRate) / ToRate
    // e.g. 5800 PHP -> USD: 5800 * 0.018 / 1 = 104.4
    // e.g. 100 USD -> PHP: 100 * 1 / 0.018 = 5555.5
    return (amount * fromRate) / toRate;
}

/**
 * Get currency symbol
 */
export function getCurrencySymbol(currency: string): string {
    switch (currency.toUpperCase()) {
        case 'USD': return '$';
        case 'PHP': return '₱';
        case 'KRW': return '₩';
        case 'JPY': return '¥';
        case 'EUR': return '€';
        case 'GBP': return '£';
        default: return currency;
    }
}
