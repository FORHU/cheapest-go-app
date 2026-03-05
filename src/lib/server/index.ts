// Server layer barrel exports

// Auth
export { getAuthenticatedUser, getUserProfile, type AuthResult } from './auth';

// Bookings
export {
    verifyBookingOwnership,
    prebookRoom,
    confirmBooking,
    confirmAndSaveBooking,
    cancelBooking,
    amendBooking,
    getBookingDetails,
    saveBookingToDatabase,
    getUserBookings,
    type ConfirmAndSaveInput,
    type ConfirmAndSaveResult,
} from './bookings';

// Vouchers
export {
    validateVoucherServer,
    getAvailableVouchersServer,
    recordVoucherUsage,
} from './vouchers';

// Search
export { autocompleteDestinations } from './search';

// Email
export { sendBookingConfirmationEmail, sendFlightBookingConfirmationEmail, sendFlightAwaitingTicketEmail, sendFlightRefundEmail } from './email';

// Policy normalizer
export { normalizeLiteApiPolicy, type NormalizedPolicy } from './policy-normalizer';

// Cancellation Engine
export { calculateCancellation, type CancellationResult } from './cancellation-engine';

// LiteAPI gateway
export {
    autocompleteLiteApi,
    searchLiteApi,
    prebookLiteApi,
    bookLiteApi,
    cancelBookingLiteApi,
    amendBookingLiteApi,
    getBookingDetailsLiteApi,
    listVouchersLiteApi,
    getHotelReviewsLiteApi,
} from './liteapi';

// Types
export type {
    ApiResult,
    PrebookParams,
    BookingParams,
    AmendBookingParams,
    SaveBookingParams,
    PrebookResult,
    BookingResult,
    CancelBookingResult,
    AmendBookingResult,
    CancellationPolicy,
    GetUserBookingsResult,
    BookingDetailsResult,
} from './types';
