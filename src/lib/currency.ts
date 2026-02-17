/**
 * Currency conversion utilities
 * 
 * Note: These are approximate exchange rates for display purposes.
 * In a real application, these should be fetched from a live API.
 */

export const EXCHANGE_RATES: Record<string, number> = {
    'USD': 1,           // Base currency
    'PHP': 58.0,        // Philippine Peso
    'KRW': 1350.0,      // South Korean Won
    'JPY': 150.0,       // Japanese Yen
    'EUR': 0.92,        // Euro
    'GBP': 0.79,        // British Pound
    'AUD': 1.52,        // Australian Dollar
    'SGD': 1.35,        // Singapore Dollar
    'MYR': 4.75,        // Malaysian Ringgit
    'THB': 36.0,        // Thai Baht
    'VND': 25450.0,     // Vietnamese Dong
    'IDR': 16100.0,     // Indonesian Rupiah
    'CNY': 7.23,        // Chinese Yuan
    'TWD': 32.5,        // New Taiwan Dollar
    'HKD': 7.83,        // Hong Kong Dollar
    'INR': 83.5,        // Indian Rupee
    'AED': 3.67,        // UAE Dirham
    'CAD': 1.37,        // Canadian Dollar
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

    // Convert: Amount / FromRate * ToRate
    // e.g. 100 PHP -> USD: 100 / 58 * 1 = 1.72
    // e.g. 100 USD -> PHP: 100 / 1 * 58 = 5800
    return (amount / fromRate) * toRate;
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
