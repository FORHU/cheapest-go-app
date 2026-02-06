export {
  prebookRoom,
  confirmBooking,
  cancelBooking,
  amendBooking,
  getBookingDetails,
  saveBookingToDatabase,
} from './booking';

export type {
  PrebookParams,
  PrebookResult,
  BookingParams,
  BookingResult,
  CancelBookingResult,
  AmendBookingParams,
  AmendBookingResult,
  BookingDetailsResult,
  SaveBookingParams,
  CancellationPolicy,
} from './types';
