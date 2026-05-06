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

// ============================================================================
// Slug utilities
// ============================================================================

/** Convert any string to a URL-safe slug (lowercase, hyphens, no special chars). */
export function slugify(text: string): string {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '') // strip accents
        .replace(/[^a-z0-9\s-]/g, '')    // remove non-alphanumeric
        .trim()
        .replace(/\s+/g, '-')            // spaces → hyphens
        .replace(/-+/g, '-');            // collapse multiple hyphens
}

/**
 * Build a property slug that embeds the hotel ID so no DB lookup is needed.
 * Format: `{name-slug}--{id}`
 * The `--` double-dash is the separator (hotel names never contain double dashes).
 */
export function buildPropertySlug(name: string, id: string): string {
    return `${slugify(name)}--${id}`;
}

/**
 * Parse a property slug back into its components.
 * Works on both new slugs (`grand-hyatt-bangkok--H123`) and bare IDs (`H123`).
 */
export function parsePropertySlug(slug: string): { id: string; nameSlug: string | null } {
    const sep = slug.lastIndexOf('--');
    if (sep === -1) return { id: slug, nameSlug: null };
    return { id: slug.slice(sep + 2), nameSlug: slug.slice(0, sep) };
}

/**
 * Build a flight route slug from two IATA codes.
 * Format: `mnl-to-sin`
 */
export function buildFlightSlug(origin: string, destination: string): string {
    return `${origin.toLowerCase()}-to-${destination.toLowerCase()}`;
}

/**
 * Parse a flight route slug back into IATA codes.
 * Returns null if the slug doesn't match the pattern.
 */
export function parseFlightSlug(slug: string): { origin: string; destination: string } | null {
    const match = slug.match(/^([a-z]{3})-to-([a-z]{3})$/);
    if (!match) return null;
    return { origin: match[1].toUpperCase(), destination: match[2].toUpperCase() };
}

/**
 * Build a destination slug from a city (and optional country).
 * Format: `bangkok` or `bangkok-thailand`
 */
export function buildDestinationSlug(city: string, country?: string): string {
    return country ? slugify(`${city} ${country}`) : slugify(city);
}
