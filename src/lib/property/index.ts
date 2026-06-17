// Property page server utilities
export {
    fetchHotelStatic,
    fetchPropertyData,
    formatDateForApi,
    sanitizeDate,
    getDefaultDates,
    collectRoomImages,
    combineImages,
    transformFetchedToProperty,
    createFallbackProperty,
} from './fetchPropertyData';

export type {
    PropertyData,
    StaticHotelResult,
    SearchParamsInput,
    FetchPropertyResult,
} from './fetchPropertyData';
