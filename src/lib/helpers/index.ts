// Pure helper functions barrel exports

export {
    formatCurrency,
    extractPrice,
    getCurrencySymbol,
    formatPrice,
    formatPriceWithDecimals,
    calculateTotalWithTax,
    calculateDiscount,
    calculatePricePerNight,
} from './formatCurrency';

export type {
    PriceInfo,
    RateTotal,
    Rate,
} from './formatCurrency';

export {
    formatDate,
    formatDateForAPI,
    sanitizeDateParam,
    parseDate,
    calculateNights,
    getDefaultDateRange,
    formatDateForDisplay,
    formatDateRange,
    isDateInPast,
    isToday,
    addDays,
} from './date';

export {
    parseSearchParams,
    buildSearchURL,
    buildPropertyURL,
    mergeWithDefaults,
    serializeSearchParams,
    isValidSearchParams,
    DEFAULT_SEARCH_PARAMS,
} from './searchParams';

export type {
    SearchParamsData,
} from './searchParams';

// General utility functions
export {
    cn,
    delay,
    truncate,
    getInitials,
    isValidEmail,
    isClient,
    safeJsonParse,
} from './utils';
