import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

const STREET_WORDS = /\b(street|avenue|road|boulevard|drive|lane|purok|extension|ave|blvd|barangay|bgy|brgy)\b/i;

/** Extract the city portion from a raw hotel address string. */
export function extractCityFromAddress(location: string): string {
    if (!location) return '';
    const parts = location.split(',').map(p => p.trim()).filter(p => p.length > 2 && !/^\d+$/.test(p) && !p.includes('#'));
    if (parts.length === 0) return location;
    if (parts.length === 1) return parts[0];
    return STREET_WORDS.test(parts[0]) ? (parts[1] || parts[0]) : parts[0];
}

/**
 * Utility function to merge class names
 * Combines clsx for conditional classes and tailwind-merge for conflict resolution
 */
export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/**
 * Format currency with locale
 */
export function formatCurrency(
    amount: number,
    currencyCode = 'KRW',
    locale?: string
): string {
    const currency = currencyCode.toUpperCase();
    
    const localeMap: Record<string, string> = {
        'KRW': 'ko-KR',
        'USD': 'en-US',
        'PHP': 'en-PH',
        'EUR': 'de-DE',
        'JPY': 'ja-JP',
        'GBP': 'en-GB',
        'SGD': 'en-SG',
        'AUD': 'en-AU',
        'CAD': 'en-CA',
        'CNY': 'zh-CN',
        'THB': 'th-TH',
        'MYR': 'ms-MY',
    };

    const targetLocale = locale || localeMap[currency] || 'en-US';

    return new Intl.NumberFormat(targetLocale, {
        style: 'currency',
        currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount);
}

/**
 * Format date with locale
 */
export function formatDate(
    date: Date | string,
    options?: Intl.DateTimeFormatOptions,
    locale = 'en-US'
): string {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    const defaultOptions: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
    return dateObj.toLocaleDateString(locale, options || defaultOptions);
}

/**
 * Delay utility for async operations
 */
export function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Truncate string with ellipsis
 */
export function truncate(str: string, length: number): string {
    if (str.length <= length) return str;
    return `${str.slice(0, length)}...`;
}

/**
 * Generate initials from name
 */
export function getInitials(firstName: string, lastName?: string): string {
    const first = firstName.charAt(0).toUpperCase();
    const last = lastName ? lastName.charAt(0).toUpperCase() : '';
    return `${first}${last}`;
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Check if running on client side
 */
export function isClient(): boolean {
    return typeof window !== 'undefined';
}

/**
 * Calculate number of nights between two dates
 */
export function calculateNights(checkIn: Date | string, checkOut: Date | string): number {
    const start = typeof checkIn === 'string' ? new Date(checkIn) : checkIn;
    const end = typeof checkOut === 'string' ? new Date(checkOut) : checkOut;
    return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Safe JSON parse with fallback
 */
export function safeJsonParse<T>(json: string, fallback: T): T {
    try {
        return JSON.parse(json) as T;
    } catch {
        return fallback;
    }
}

/**
 * Convert raw status strings (e.g., 'refund_pending') to human-readable format ('Refund Pending')
 */
export function formatStatus(status: string): string {
    if (!status) return '';
    return status
        .replace(/_/g, ' ')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

function slugify(str: string): string {
    return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Build a URL slug for a destination: "manila-philippines" */
export function buildDestinationSlug(name: string, location?: string): string {
    const parts = [name, location].filter(Boolean).map(s => slugify(s!));
    return parts.join('-');
}

/** Build a URL slug for a property: "grand-hyatt-bangkok--H7002461" */
export function buildPropertySlug(name: string, id: string): string {
    return `${slugify(name)}--${id}`;
}

/** Parse a property slug back to { id, nameSlug }. Bare IDs pass through unchanged. */
export function parsePropertySlug(slug: string): { id: string; nameSlug: string } {
    const idx = slug.lastIndexOf('--');
    if (idx === -1) return { id: slug, nameSlug: '' };
    return { id: slug.slice(idx + 2), nameSlug: slug.slice(0, idx) };
}

/** Parse a flight slug like "MNL-to-ICN" → { origin: "MNL", destination: "ICN" } */
export function parseFlightSlug(slug: string): { origin: string; destination: string } | null {
    const match = slug.match(/^([a-zA-Z0-9]+)-to-([a-zA-Z0-9]+)$/i);
    if (!match) return null;
    return { origin: match[1].toUpperCase(), destination: match[2].toUpperCase() };
}
