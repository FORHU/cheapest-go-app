/**
 * Booking type definitions.
 *
 * All runtime booking operations use server actions in `@/app/actions/booking.ts`.
 * This file only exports types consumed across the codebase.
 */

/**
 * Prebook parameters for room reservation
 */
export interface PrebookParams {
  offerId: string;
  currency: string;
  voucherCode?: string;
}

/**
 * Guest information for booking
 */
export interface Guest {
  occupancyNumber: number;
  firstName: string;
  lastName: string;
  email: string;
  remarks?: string;
}

/**
 * Booking confirmation parameters
 */
export interface BookingParams {
  prebookId: string;
  holder: {
    firstName: string;
    lastName: string;
    email: string;
  };
  guests: Guest[];
  payment: {
    method: string;
    transactionId?: string;
  };
}

/**
 * Prebook response from LiteAPI
 */
export interface PrebookResponse {
  prebookId: string;
  price?: {
    subtotal?: number;
    taxes?: number;
    total: number;
  };
  status?: string;
  /** Cancellation policies from prebook response */
  cancellationPolicies?: CancellationPolicy;
  /** Payment SDK secret key (when usePaymentSdk: true) */
  secretKey?: string;
  /** Payment SDK transaction ID (when usePaymentSdk: true) */
  transactionId?: string;
}

/**
 * Booking response from LiteAPI
 */
export interface BookingResponse {
  bookingId: string;
  status: string;
  confirmationNumber?: string;
}

/**
 * Parameters to save a booking to database
 */
export interface SaveBookingParams {
  bookingId: string;
  userId: string;
  propertyName: string;
  propertyImage?: string;
  roomName: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  totalPrice: number;
  currency: string;
  holderFirstName: string;
  holderLastName: string;
  holderEmail: string;
  specialRequests?: string;
  cancellationPolicy?: CancellationPolicy;
}

/**
 * Booking record from database
 */
export interface BookingRecord {
  id: string;
  booking_id: string;
  user_id: string;
  property_name: string;
  property_image?: string;
  room_name: string;
  check_in: string;
  check_out: string;
  guests_adults: number;
  guests_children: number;
  total_price: number;
  currency: string;
  holder_first_name: string;
  holder_last_name: string;
  holder_email: string;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  special_requests?: string;
  created_at: string;
  updated_at: string;
  cancellation_policy?: CancellationPolicy;
}

/**
 * Cancellation policy info from LiteAPI
 */
export interface CancellationPolicy {
  cancelPolicyInfos?: CancelPolicyInfo[];
  hotelRemarks?: string[];
  refundableTag?: string; // "RFN" = refundable, "NRFN" = non-refundable
}

export interface CancelPolicyInfo {
  cancelTime: string; // ISO timestamp
  amount: number;
  currency: string;
  type: string; // e.g., "PERCENT" or "AMOUNT"
}

/**
 * Booking details from LiteAPI
 */
export interface BookingDetailsResponse {
  bookingId: string;
  status: string;
  hotel: {
    name: string;
    hotelId: string;
  };
  bookedRooms: Array<{
    roomType: string;
    adults: number;
    children: number;
    rate: {
      retailRate: {
        total: { amount: number; currency: string };
      };
    };
  }>;
  guestInfo: {
    guestFirstName: string;
    guestLastName: string;
    guestEmail: string;
  };
  checkin: string;
  checkout: string;
  cancellationPolicies?: {
    cancelPolicyInfos?: CancelPolicyInfo[];
    hotelRemarks?: string[];
    refundableTag?: string;
  };
  cancellation?: {
    cancelAllowed: boolean;
    fee?: {
      amount: number;
      currency: string;
    };
    refund?: {
      amount: number;
      currency: string;
    };
  };
}

/**
 * Cancellation response from LiteAPI
 */
export interface CancellationResponse {
  bookingId: string;
  status: string;
  cancellationId?: string;
  refund?: {
    amount: number;
    currency: string;
  };
}

/**
 * Parameters for amending a booking's holder information
 */
export interface AmendBookingParams {
  bookingId: string;
  firstName: string;
  lastName: string;
  email: string;
  remarks?: string;
}

/**
 * Response from LiteAPI amend endpoint
 */
export interface AmendBookingResponse {
  bookingId: string;
}

/**
 * Flight segment record from database
 */
export interface FlightSegmentRecord {
  id: string;
  booking_id: string;
  airline: string;
  flight_number: string;
  origin: string;
  destination: string;
  departure: string;
  arrival: string;
}

/**
 * Flight passenger record from database
 */
export interface FlightPassengerRecord {
  id: string;
  booking_id: string;
  first_name: string;
  last_name: string;
  type: string;
  passport?: string | null;
  ticket_number?: string | null;
}

/**
 * Flight booking record from database
 */
export interface FlightBookingRecord {
  id: string;
  user_id: string;
  pnr: string;
  provider: 'duffel' | 'mystifly';
  total_price: number;
  currency?: string;
  trip_type?: 'one-way' | 'round-trip' | 'multi-city';
  status: 'booked' | 'pnr_created' | 'awaiting_ticket' | 'ticketed' | 'failed' | 'cancel_requested' | 'cancelled' | 'cancel_failed' | 'refund_pending' | 'refund_failed' | 'refunded' | 'cancelled_provider_missing';
  created_at: string;

  fare_policy?: any;
  cancellation_log?: any[];
  refund_amount?: number;
  refund_penalty_amount?: number;
  refund_currency?: string;

  // Joined relation fields
  flight_segments?: FlightSegmentRecord[];
  passengers?: FlightPassengerRecord[];
}
