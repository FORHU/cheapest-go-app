/**
 * Pricing utility functions
 * Centralized price extraction and formatting logic
 * Replaces duplicated code in RoomList, checkout, and search pages
 */

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
 *
 * @example
 * // Array format: [{ amount: 5000, currency: 'PHP' }]
 * const price = extractPrice(room.rates);
 * // { amount: 5000, currency: 'PHP' }
 *
 * // Object format: { amount: 5000 }
 * const price = extractPrice(room.rates);
 * // { amount: 5000, currency: 'PHP' }
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
        PHP: '₱',
        USD: '$',
        EUR: '€',
        GBP: '£',
        JPY: '¥',
        KRW: '₩',
        SGD: 'S$',
        MYR: 'RM',
        THB: '฿',
        IDR: 'Rp',
        VND: '₫',
    };
    return symbols[currency] || currency;
};

/**
 * Format price with currency symbol and locale formatting
 *
 * @example
 * formatPrice(5000, 'PHP')
 * // "₱5,000"
 *
 * formatPrice(5000, 'USD', 'en-US')
 * // "$5,000"
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
 *
 * @example
 * const { subtotal, tax, total } = calculateTotalWithTax(5000, 0.12);
 * // { subtotal: 5000, tax: 600, total: 5600 }
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
 *
 * @example
 * calculateDiscount(100, 80)
 * // 20 (20% off)
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
