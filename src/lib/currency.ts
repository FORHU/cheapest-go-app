/**
 * Currency conversion utilities
 * 
 * Note: These are approximate exchange rates for display purposes.
 * In a real application, these should be fetched from a live API.
 */

export const EXCHANGE_RATES: Record<string, number> = {
    'USD': 1.0,         // Base currency
    'PHP': 0.018,       // Philippine Peso (USD per 1 PHP)
    'KRW': 0.00075,     // South Korean Won (USD per 1 KRW)
    'JPY': 0.0067,      // Japanese Yen
    'EUR': 1.087,       // Euro
    'GBP': 1.266,       // British Pound
    'AUD': 0.658,       // Australian Dollar
    'SGD': 0.74,        // Singapore Dollar
    'MYR': 0.21,        // Malaysian Ringgit
    'THB': 0.027,       // Thai Baht
    'VND': 0.0000392,   // Vietnamese Dong
    'IDR': 0.0000621,   // Indonesian Rupiah
    'CNY': 0.138,       // Chinese Yuan
    'TWD': 0.0307,      // New Taiwan Dollar
    'HKD': 0.127,       // Hong Kong Dollar
    'INR': 0.012,       // Indian Rupee
    'AED': 0.272,       // UAE Dirham
    'CAD': 0.73,        // Canadian Dollar
};

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
