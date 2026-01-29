import { invokeEdgeFunction } from '@/utils/supabase/client-functions';

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
};
