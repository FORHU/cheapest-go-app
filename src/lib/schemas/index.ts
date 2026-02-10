// Auth schemas
export {
  emailSchema,
  passwordSchema,
  loginSchema,
  registerSchema,
  profileSchema,
  updatePasswordSchema,
} from './auth';
export type {
  EmailInput,
  LoginInput,
  RegisterInput,
  ProfileInput,
  UpdatePasswordInput,
} from './auth';

// Booking schemas
export {
  prebookSchema,
  guestSchema,
  holderSchema,
  bookingConfirmSchema,
  cancelBookingSchema,
  amendBookingSchema,
  amendFormSchema,
  saveBookingSchema,
  getBookingDetailsSchema,
} from './booking';
export type {
  PrebookInput,
  BookingConfirmInput,
  CancelBookingInput,
  AmendBookingInput,
  AmendFormInput,
  SaveBookingInput,
  GetBookingDetailsInput,
} from './booking';

// Checkout schemas
export {
  userDetailsSchema,
  guestDetailsSchema,
  paymentSchema,
  checkoutSchema,
} from './checkout';
export type {
  UserDetailsInput,
  GuestDetailsInput,
  PaymentInput,
  CheckoutInput,
} from './checkout';
