export {
  prebookRoom,
  confirmBooking,
  cancelBooking,
  amendBooking,
  getBookingDetails,
  saveBookingToDatabase,
  getUserBookings,
} from './booking';

export { sendBookingConfirmationEmail } from './email';

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
  GetUserBookingsResult,
  SendBookingEmailParams,
  SendBookingEmailResult,
} from './types';
