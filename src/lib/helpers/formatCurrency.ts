/**
 * Currency and pricing utility functions
 * Centralized price extraction and formatting logic
 */

/**
 * Format currency with locale
 */
export function formatCurrency(
    amount: number,
    currency = 'PHP',
    locale = 'en-PH'
): string {
    return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
    }).format(amount);
}

/**
 * Price information extracted from API response
 */
export interface PriceInfo {
    amount: number;
    currency: string;
    subtotal?: number;
    taxes?: number;
}

/**
 * Rate structure from LiteAPI
 */
export interface RateTotal {
    amount: number;
    currency?: string;
}

export interface Rate {
    retailRate?: {
        total?: RateTotal[] | RateTotal;
    };
}

/**
 * Extract price from LiteAPI rate structure
 * Handles both array and object formats
 */
export const extractPrice = (rates?: Rate[]): PriceInfo => {
    if (!rates || rates.length === 0) {
        return { amount: 0, currency: 'PHP' };
    }

    const total = rates[0]?.retailRate?.total;

    // Handle array format: [{ amount: number, currency: string }]
    if (Array.isArray(total) && total.length > 0) {
        return {
            amount: total[0].amount || 0,
            currency: total[0].currency || 'PHP',
        };
    }

    // Handle object format: { amount: number }
    if (typeof total === 'object' && total !== null && 'amount' in total) {
        return {
            amount: (total as RateTotal).amount || 0,
            currency: (total as RateTotal).currency || 'PHP',
        };
    }

    return { amount: 0, currency: 'PHP' };
};

/**
 * Get currency symbol for a given currency code
 */
export const getCurrencySymbol = (currency: string): string => {
    const symbols: Record<string, string> = {
        PHP: '\u20B1',
        USD: '$',
        EUR: '\u20AC',
        GBP: '\u00A3',
        JPY: '\u00A5',
        KRW: '\u20A9',
        SGD: 'S$',
        MYR: 'RM',
        THB: '\u0E3F',
        IDR: 'Rp',
        VND: '\u20AB',
    };
    return symbols[currency] || currency;
};

/**
 * Format price with currency symbol and locale formatting
 */
export const formatPrice = (
    amount: number,
    currency: string = 'PHP',
    locale: string = 'en-PH'
): string => {
    const symbol = getCurrencySymbol(currency);
    return `${symbol}${amount.toLocaleString(locale)}`;
};

/**
 * Format price with decimal places
 */
export const formatPriceWithDecimals = (
    amount: number,
    currency: string = 'PHP',
    decimals: number = 2
): string => {
    const symbol = getCurrencySymbol(currency);
    return `${symbol}${amount.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    })}`;
};

/**
 * Calculate total with tax
 */
export const calculateTotalWithTax = (
    price: number,
    taxRate: number = 0.12
): { subtotal: number; tax: number; total: number } => {
    const tax = price * taxRate;
    return {
        subtotal: price,
        tax: Math.round(tax * 100) / 100,
        total: Math.round((price + tax) * 100) / 100,
    };
};

/**
 * Calculate discount percentage
 */
export const calculateDiscount = (
    originalPrice: number,
    currentPrice: number
): number => {
    if (originalPrice <= 0) return 0;
    return Math.round((1 - currentPrice / originalPrice) * 100);
};

/**
 * Calculate price per night
 */
export const calculatePricePerNight = (
    totalPrice: number,
    nights: number
): number => {
    if (nights <= 0) return totalPrice;
    return Math.round(totalPrice / nights);
};
