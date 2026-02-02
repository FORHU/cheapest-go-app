// Property page server utilities
export {
    fetchPropertyData,
    getMockProperty,
    formatDate,
    sanitizeDate,
    getDefaultDates,
    collectRoomImages,
    combineImages,
    transformFetchedToProperty,
    createFallbackProperty,
} from './fetchPropertyData';

export type {
    PropertyData,
    SearchParamsInput,
    FetchPropertyResult,
} from './fetchPropertyData';
