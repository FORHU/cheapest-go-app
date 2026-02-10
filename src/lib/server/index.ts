// Server layer barrel exports

// Auth
export { getAuthenticatedUser, type AuthResult } from './auth';

// Bookings
export {
    verifyBookingOwnership,
    prebookRoom,
    confirmBooking,
    cancelBooking,
    amendBooking,
    getBookingDetails,
    saveBookingToDatabase,
    getUserBookings,
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
export { sendBookingConfirmationEmail } from './email';

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
