// Server-side logic barrel exports
// All backend logic is centralized here

export {
  getCurrentUser,
  updateProfile,
  updatePassword,
  signOut,
  resetPasswordForEmail,
} from './auth';

export type {
  AuthResult,
  UserProfile,
} from './auth';

export {
  prebookRoom,
  confirmBooking,
  cancelBooking,
  amendBooking,
  getBookingDetails,
  saveBookingToDatabase,
  getUserBookings,
  updateBookingStatus,
} from './bookings';

export type {
  PrebookParams,
  PrebookResult,
  BookingParams,
  BookingResult,
  CancelBookingResult,
  AmendBookingParams,
  AmendBookingResult,
  CancellationPolicy,
  CancelPolicyInfo,
  PrebookResponse,
  SaveBookingParams,
  BookingDetailsResult,
  BookingRecord,
} from './bookings';
