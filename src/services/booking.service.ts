import { invokeEdgeFunction } from '@/utils/supabase/client-functions';
import { createClient } from '@/lib/supabase-client';

/**
 * Prebook parameters for room reservation
 */
export interface PrebookParams {
  offerId: string;
  currency: string;
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
  status: string;
}

/**
 * Booking service for prebook and confirmation
 * Wraps Supabase Edge Functions with typed interfaces
 */
export const bookingService = {
  /**
   * Prebook a room to reserve it temporarily
   * @param params - Offer ID and currency
   * @returns Prebook response with prebookId and price
   */
  prebook: async (params: PrebookParams): Promise<PrebookResponse> => {
    // invokeEdgeFunction throws on error, so we just return the data
    const result = await invokeEdgeFunction('liteapi-prebook-v2', params);
    return result.data;
  },

  /**
   * Confirm booking with guest and payment details
   * @param params - Booking details including prebookId, holder, guests, payment
   * @returns Booking confirmation with bookingId
   */
  confirmBooking: async (params: BookingParams): Promise<BookingResponse> => {
    // invokeEdgeFunction throws on error, so we just return the data
    const result = await invokeEdgeFunction('liteapi-book-v2', params);
    return result.data;
  },

  /**
   * Refresh an expired prebook session
   * @param params - Offer ID and currency
   * @returns New prebook response
   */
  refreshPrebook: async (params: PrebookParams): Promise<PrebookResponse> => {
    // Same as prebook but semantically different - used when session expires
    return bookingService.prebook(params);
  },

  /**
   * Save booking to database for history
   */
  saveBooking: async (booking: SaveBookingParams): Promise<void> => {
    const supabase = createClient();
    const baseData = {
      booking_id: booking.bookingId,
      user_id: booking.userId,
      property_name: booking.propertyName,
      property_image: booking.propertyImage,
      room_name: booking.roomName,
      check_in: booking.checkIn,
      check_out: booking.checkOut,
      guests_adults: booking.adults,
      guests_children: booking.children,
      total_price: booking.totalPrice,
      currency: booking.currency,
      holder_first_name: booking.holderFirstName,
      holder_last_name: booking.holderLastName,
      holder_email: booking.holderEmail,
      status: 'confirmed',
      special_requests: booking.specialRequests,
    };

    // Try with cancellation_policy first, fallback without if column doesn't exist
    const { error } = await supabase.from('bookings').insert({
      ...baseData,
      cancellation_policy: booking.cancellationPolicy || null,
    });

    if (error) {
      // Retry without cancellation_policy in case column doesn't exist yet
      const { error: retryError } = await supabase.from('bookings').insert(baseData);
      if (retryError) {
        console.error('Failed to save booking:', retryError);
        throw retryError;
      }
    }
  },

  /**
   * Fetch user's booking history
   */
  getUserBookings: async (): Promise<BookingRecord[]> => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch bookings:', error);
      throw error;
    }

    return data || [];
  },

  /**
   * Get booking details from LiteAPI
   * @param bookingId - The booking ID to retrieve
   * @returns Booking details including cancellation policies
   */
  getBookingDetails: async (bookingId: string): Promise<BookingDetailsResponse> => {
    const result = await invokeEdgeFunction('liteapi-booking-details', { bookingId });
    return result.data;
  },

  /**
   * Cancel a booking via LiteAPI
   * @param bookingId - The booking ID to cancel
   * @returns Cancellation response with refund information
   */
  cancelBooking: async (bookingId: string): Promise<CancellationResponse> => {
    const result = await invokeEdgeFunction('liteapi-cancel-booking', { bookingId });
    return result.data;
  },

  /**
   * Update booking status in database after cancellation
   * @param bookingId - The booking ID to update
   * @param status - New status
   */
  updateBookingStatus: async (bookingId: string, status: BookingRecord['status']): Promise<void> => {
    const supabase = createClient();
    const { error } = await supabase
      .from('bookings')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('booking_id', bookingId);

    if (error) {
      console.error('Failed to update booking status:', error);
      throw error;
    }
  },

  /**
   * Amend a booking's holder information via LiteAPI
   * The edge function also updates the local database
   * @param params - The amendment details
   * @returns Amendment response
   */
  amendBooking: async (params: AmendBookingParams): Promise<AmendBookingResponse> => {
    const result = await invokeEdgeFunction('liteapi-amend-booking', params);
    return result.data;
  },
};
