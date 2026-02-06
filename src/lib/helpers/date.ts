/**
 * Date utility functions
 * Centralized date formatting and manipulation logic
 */

/**
 * Format date with locale
 */
export function formatDate(
    date: Date | string,
    options?: Intl.DateTimeFormatOptions,
    locale = 'en-PH'
): string {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateObj.toLocaleDateString(locale, options);
}

/**
 * Format date for API requests (YYYY-MM-DD)
 */
export const formatDateForAPI = (date: Date | string | undefined | null): string => {
    if (!date) return '';

    try {
        const d = typeof date === 'string' ? new Date(date) : date;
        if (isNaN(d.getTime())) return '';
        return d.toISOString().split('T')[0];
    } catch {
        return '';
    }
};

/**
 * Sanitize date parameter from URL
 * Handles URL-encoded date strings
 */
export const sanitizeDateParam = (
    dateParam: string | undefined | null
): string | undefined => {
    if (!dateParam) return undefined;

    try {
        const decoded = decodeURIComponent(dateParam);
        const date = new Date(decoded);
        if (isNaN(date.getTime())) return undefined;
        return date.toISOString().split('T')[0];
    } catch {
        return undefined;
    }
};

/**
 * Parse date string to Date object
 * Returns null for invalid dates
 */
export const parseDate = (dateString: string | undefined | null): Date | null => {
    if (!dateString) return null;

    try {
        const date = new Date(dateString);
        return isNaN(date.getTime()) ? null : date;
    } catch {
        return null;
    }
};

/**
 * Calculate number of nights between two dates
 */
export const calculateNights = (
    checkIn: Date | string | null | undefined,
    checkOut: Date | string | null | undefined
): number => {
    if (!checkIn || !checkOut) return 0;

    const startDate = typeof checkIn === 'string' ? new Date(checkIn) : checkIn;
    const endDate = typeof checkOut === 'string' ? new Date(checkOut) : checkOut;

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return 0;

    const msPerDay = 1000 * 60 * 60 * 24;
    return Math.max(0, Math.ceil((endDate.getTime() - startDate.getTime()) / msPerDay));
};

/**
 * Get default date range (tomorrow to day after tomorrow)
 */
export const getDefaultDateRange = (): { checkIn: string; checkOut: string } => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const dayAfter = new Date(tomorrow);
    dayAfter.setDate(tomorrow.getDate() + 2);

    return {
        checkIn: formatDateForAPI(tomorrow),
        checkOut: formatDateForAPI(dayAfter),
    };
};

/**
 * Format date for display (e.g., "Jan 23, 2026")
 */
export const formatDateForDisplay = (
    date: Date | string | null | undefined,
    locale: string = 'en-US'
): string => {
    if (!date) return '';

    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '';

    return d.toLocaleDateString(locale, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
};

/**
 * Format date range for display (e.g., "Jan 23 - 25, 2026")
 */
export const formatDateRange = (
    checkIn: Date | string | null | undefined,
    checkOut: Date | string | null | undefined,
    locale: string = 'en-US'
): string => {
    if (!checkIn || !checkOut) return '';

    const startDate = typeof checkIn === 'string' ? new Date(checkIn) : checkIn;
    const endDate = typeof checkOut === 'string' ? new Date(checkOut) : checkOut;

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return '';

    const sameMonth = startDate.getMonth() === endDate.getMonth();
    const sameYear = startDate.getFullYear() === endDate.getFullYear();

    if (sameYear && sameMonth) {
        return `${startDate.toLocaleDateString(locale, { month: 'short', day: 'numeric' })} - ${endDate.getDate()}, ${endDate.getFullYear()}`;
    }

    if (sameYear) {
        return `${startDate.toLocaleDateString(locale, { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString(locale, { month: 'short', day: 'numeric' })}, ${endDate.getFullYear()}`;
    }

    return `${formatDateForDisplay(startDate, locale)} - ${formatDateForDisplay(endDate, locale)}`;
};

/**
 * Check if a date is in the past
 */
export const isDateInPast = (date: Date | string | null | undefined): boolean => {
    if (!date) return false;

    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return d < today;
};

/**
 * Check if a date is today
 */
export const isToday = (date: Date | string | null | undefined): boolean => {
    if (!date) return false;

    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return false;

    const today = new Date();
    return (
        d.getDate() === today.getDate() &&
        d.getMonth() === today.getMonth() &&
        d.getFullYear() === today.getFullYear()
    );
};

/**
 * Add days to a date
 */
export const addDays = (date: Date | string, days: number): Date => {
    const d = typeof date === 'string' ? new Date(date) : new Date(date);
    d.setDate(d.getDate() + days);
    return d;
};
