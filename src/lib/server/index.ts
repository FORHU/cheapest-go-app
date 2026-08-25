// Server layer barrel exports

// Auth
export { getAuthenticatedUser, getUserProfile, type AuthResult } from './auth';

// Bookings
export {
    verifyBookingOwnership,
    confirmAndSaveTgxBooking,
    cancelBooking,
    amendBooking,
    getBookingDetails,
    saveBookingToDatabase,
    getUserBookings,
    type ConfirmAndSaveResult,
    type TgxConfirmInput,
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
export { sendBookingConfirmationEmail, sendHotelCancellationEmail, sendHotelAmendmentEmail, sendFlightBookingConfirmationEmail, sendFlightAwaitingTicketEmail, sendFlightRefundEmail, sendFlightCancellationEmail, sendFlightCancellationRefundEmail, sendFlightAmendmentEmail } from './email';

// Policy normalizer
export { normalizeLiteApiPolicy, type NormalizedPolicy } from './policy-normalizer';

// Cancellation Engine
export { calculateCancellation, type CancellationResult } from './cancellation-engine';

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
