/**
 * Search parameters utility functions
 * Centralized URL parameter parsing and building logic
 * Replaces duplicated code in search and property pages
 */

import { sanitizeDateParam, getDefaultDateRange } from './dates';

/**
 * Parsed search parameters data
 */
export interface SearchParamsData {
    destination?: string;
    countryCode?: string;
    placeId?: string;
    checkIn: string;
    checkOut: string;
    adults: number;
    children: number;
    rooms: number;
    nationality: string;
    currency: string;
}

/**
 * Default search parameters
 */
export const DEFAULT_SEARCH_PARAMS: Omit<SearchParamsData, 'checkIn' | 'checkOut'> = {
    adults: 2,
    children: 0,
    rooms: 1,
    nationality: 'KR',
    currency: 'PHP',
};

/**
 * Parse search parameters from URLSearchParams or plain object
 *
 * @example
 * // From URLSearchParams
 * const params = parseSearchParams(new URLSearchParams(window.location.search));
 *
 * // From Next.js searchParams
 * const params = parseSearchParams(searchParams);
 */
export const parseSearchParams = (
    params: URLSearchParams | Record<string, string | string[] | undefined>
): SearchParamsData => {
    const getParam = (key: string): string | undefined => {
        if (params instanceof URLSearchParams) {
            return params.get(key) || undefined;
        }
        const value = params[key];
        return typeof value === 'string' ? value : undefined;
    };

    const defaults = getDefaultDateRange();

    return {
        destination: getParam('destination'),
        countryCode: getParam('countryCode'),
        placeId: getParam('placeId'),
        checkIn: sanitizeDateParam(getParam('checkIn')) || defaults.checkIn,
        checkOut: sanitizeDateParam(getParam('checkOut')) || defaults.checkOut,
        adults: parseInt(getParam('adults') || '2', 10),
        children: parseInt(getParam('children') || '0', 10),
        rooms: parseInt(getParam('rooms') || '1', 10),
        nationality: getParam('nationality') || 'KR',
        currency: getParam('currency') || 'PHP',
    };
};

/**
 * Build search URL with parameters
 *
 * @example
 * buildSearchURL({ destination: 'Seoul', checkIn: '2026-01-23', checkOut: '2026-01-25' })
 * // "/search?destination=Seoul&checkIn=2026-01-23&checkOut=2026-01-25"
 */
export const buildSearchURL = (
    data: Partial<SearchParamsData>,
    basePath: string = '/search'
): string => {
    const params = new URLSearchParams();

    Object.entries(data).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            params.set(key, String(value));
        }
    });

    const queryString = params.toString();
    return queryString ? `${basePath}?${queryString}` : basePath;
};

/**
 * Build property URL with search parameters preserved
 *
 * @example
 * buildPropertyURL('hotel-123', searchParams)
 * // "/property/hotel-123?checkIn=2026-01-23&checkOut=2026-01-25&adults=2"
 */
export const buildPropertyURL = (
    propertyId: string,
    searchParams?: Partial<SearchParamsData>
): string => {
    const basePath = `/property/${propertyId}`;

    if (!searchParams) return basePath;

    const params = new URLSearchParams();
    const keysToPreserve = ['checkIn', 'checkOut', 'adults', 'children', 'rooms', 'currency'];

    keysToPreserve.forEach((key) => {
        const value = searchParams[key as keyof SearchParamsData];
        if (value !== undefined && value !== null && value !== '') {
            params.set(key, String(value));
        }
    });

    const queryString = params.toString();
    return queryString ? `${basePath}?${queryString}` : basePath;
};

/**
 * Merge search parameters with defaults
 */
export const mergeWithDefaults = (
    params: Partial<SearchParamsData>
): SearchParamsData => {
    const defaults = getDefaultDateRange();

    return {
        ...DEFAULT_SEARCH_PARAMS,
        checkIn: defaults.checkIn,
        checkOut: defaults.checkOut,
        ...params,
    };
};

/**
 * Serialize search parameters to query string
 */
export const serializeSearchParams = (
    params: Partial<SearchParamsData>
): string => {
    const urlParams = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            urlParams.set(key, String(value));
        }
    });

    return urlParams.toString();
};

/**
 * Check if search parameters are valid for API request
 */
export const isValidSearchParams = (params: Partial<SearchParamsData>): boolean => {
    // Must have either destination or placeId
    const hasLocation = !!(params.destination || params.placeId);

    // Must have valid dates
    const hasValidDates = !!(params.checkIn && params.checkOut);

    // Must have at least 1 adult
    const hasValidGuests = (params.adults || 0) >= 1;

    return hasLocation && hasValidDates && hasValidGuests;
};
