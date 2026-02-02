import { invokeEdgeFunction } from '@/utils/supabase/client-functions';
import { createClient } from '@/utils/supabase/client';

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
    const { error } = await supabase.from('bookings').insert({
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
    });

    if (error) {
      console.error('Failed to save booking:', error);
      throw error;
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
};
