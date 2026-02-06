'use server';

/**
 * Server Actions for booking operations.
 * All LiteAPI calls are proxied through Supabase Edge Functions,
 * keeping API keys and business logic server-side.
 */

import { createClient } from '@/lib/supabase-server';
import { invokeEdgeFunction } from '@/utils/supabase/functions';
import { revalidatePath } from 'next/cache';

// ============================================================================
// Types
// ============================================================================

export interface PrebookParams {
  offerId: string;
  currency: string;
}

export interface PrebookResult {
  success: boolean;
  data?: {
    prebookId: string;
    price?: {
      subtotal?: number;
      taxes?: number;
      total: number;
    };
    status?: string;
    cancellationPolicies?: CancellationPolicy;
  };
  error?: string;
}

export interface BookingParams {
  prebookId: string;
  holder: {
    firstName: string;
    lastName: string;
    email: string;
  };
  guests: Array<{
    occupancyNumber: number;
    firstName: string;
    lastName: string;
    email: string;
    remarks?: string;
  }>;
  payment: {
    method: string;
  };
}

export interface BookingResult {
  success: boolean;
  data?: {
    bookingId: string;
    status: string;
    confirmationNumber?: string;
  };
  error?: string;
}

export interface CancelBookingResult {
  success: boolean;
  data?: {
    bookingId: string;
    status: string;
    cancellationId?: string;
    refund?: {
      amount: number;
      currency: string;
    };
  };
  error?: string;
}

export interface AmendBookingParams {
  bookingId: string;
  firstName: string;
  lastName: string;
  email: string;
  remarks?: string;
}

export interface AmendBookingResult {
  success: boolean;
  data?: {
    bookingId: string;
    status: string;
  };
  error?: string;
}

export interface CancellationPolicy {
  cancelPolicyInfos?: CancelPolicyInfo[];
  hotelRemarks?: string[];
  refundableTag?: string;
}

export interface CancelPolicyInfo {
  cancelTime: string;
  amount: number;
  currency: string;
  type: string;
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
  cancellationPolicies?: CancellationPolicy;
}

export interface SaveBookingParams {
  bookingId: string;
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

export interface BookingDetailsResult {
  success: boolean;
  data?: {
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
    cancellationPolicies?: CancellationPolicy;
    cancellation?: {
      cancelAllowed: boolean;
      fee?: { amount: number; currency: string };
      refund?: { amount: number; currency: string };
    };
  };
  error?: string;
}

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

// ============================================================================
// Helper: Get authenticated user
// ============================================================================

async function getAuthenticatedUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return { user: null, supabase, error: 'Not authenticated' };
  }

  return { user, supabase, error: null };
}

// ============================================================================
// Server Actions
// ============================================================================

/**
 * Prebook a room to reserve it temporarily.
 * Requires authentication.
 */
export async function prebookRoom(params: PrebookParams): Promise<PrebookResult> {
  try {
    const { user, error: authError } = await getAuthenticatedUser();

    if (authError || !user) {
      return { success: false, error: 'Authentication required' };
    }

    const result = await invokeEdgeFunction('liteapi-prebook-v2', params);

    return {
      success: true,
      data: result.data,
    };
  } catch (error) {
    console.error('[prebookRoom] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Prebook failed',
    };
  }
}

/**
 * Confirm a booking with guest and payment details.
 * Requires authentication.
 */
export async function confirmBooking(params: BookingParams): Promise<BookingResult> {
  try {
    const { user, error: authError } = await getAuthenticatedUser();

    if (authError || !user) {
      return { success: false, error: 'Authentication required' };
    }

    const result = await invokeEdgeFunction('liteapi-book-v2', params);

    // Revalidate trips page after successful booking
    revalidatePath('/trips');

    return {
      success: true,
      data: result.data,
    };
  } catch (error) {
    console.error('[confirmBooking] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Booking confirmation failed',
    };
  }
}

/**
 * Cancel a booking via LiteAPI.
 * Requires authentication and ownership verification.
 */
export async function cancelBooking(bookingId: string): Promise<CancelBookingResult> {
  try {
    const { user, supabase, error: authError } = await getAuthenticatedUser();

    if (authError || !user) {
      return { success: false, error: 'Authentication required' };
    }

    // Verify ownership - user can only cancel their own bookings
    const { data: booking, error: fetchError } = await supabase
      .from('bookings')
      .select('user_id')
      .eq('booking_id', bookingId)
      .single();

    if (fetchError || !booking) {
      return { success: false, error: 'Booking not found' };
    }

    if (booking.user_id !== user.id) {
      return { success: false, error: 'Not authorized to cancel this booking' };
    }

    // Call LiteAPI to cancel
    const result = await invokeEdgeFunction('liteapi-cancel-booking', { bookingId });

    // Update local database status
    await supabase
      .from('bookings')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('booking_id', bookingId);

    // Revalidate trips page
    revalidatePath('/trips');

    return {
      success: true,
      data: result.data,
    };
  } catch (error) {
    console.error('[cancelBooking] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Cancellation failed',
    };
  }
}

/**
 * Amend a booking's holder information.
 * Requires authentication and ownership verification.
 */
export async function amendBooking(params: AmendBookingParams): Promise<AmendBookingResult> {
  try {
    const { user, supabase, error: authError } = await getAuthenticatedUser();

    if (authError || !user) {
      return { success: false, error: 'Authentication required' };
    }

    // Verify ownership
    const { data: booking, error: fetchError } = await supabase
      .from('bookings')
      .select('user_id')
      .eq('booking_id', params.bookingId)
      .single();

    if (fetchError || !booking) {
      return { success: false, error: 'Booking not found' };
    }

    if (booking.user_id !== user.id) {
      return { success: false, error: 'Not authorized to modify this booking' };
    }

    // Call LiteAPI to amend
    const result = await invokeEdgeFunction('liteapi-amend-booking', params);

    // Update local database
    await supabase
      .from('bookings')
      .update({
        holder_first_name: params.firstName,
        holder_last_name: params.lastName,
        holder_email: params.email,
        special_requests: params.remarks,
        updated_at: new Date().toISOString(),
      })
      .eq('booking_id', params.bookingId);

    // Revalidate trips page
    revalidatePath('/trips');

    return {
      success: true,
      data: result.data,
    };
  } catch (error) {
    console.error('[amendBooking] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Amendment failed',
    };
  }
}

/**
 * Get booking details from LiteAPI.
 * Requires authentication and ownership verification.
 */
export async function getBookingDetails(bookingId: string): Promise<BookingDetailsResult> {
  try {
    const { user, supabase, error: authError } = await getAuthenticatedUser();

    if (authError || !user) {
      return { success: false, error: 'Authentication required' };
    }

    // Verify ownership
    const { data: booking, error: fetchError } = await supabase
      .from('bookings')
      .select('user_id')
      .eq('booking_id', bookingId)
      .single();

    if (fetchError || !booking) {
      return { success: false, error: 'Booking not found' };
    }

    if (booking.user_id !== user.id) {
      return { success: false, error: 'Not authorized to view this booking' };
    }

    const result = await invokeEdgeFunction('liteapi-booking-details', { bookingId });

    return {
      success: true,
      data: result.data,
    };
  } catch (error) {
    console.error('[getBookingDetails] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get booking details',
    };
  }
}

/**
 * Save a booking to the database after confirmation.
 * Requires authentication.
 */
export async function saveBookingToDatabase(params: SaveBookingParams): Promise<{ success: boolean; error?: string }> {
  try {
    const { user, supabase, error: authError } = await getAuthenticatedUser();

    if (authError || !user) {
      return { success: false, error: 'Authentication required' };
    }

    const { error: insertError } = await supabase.from('bookings').insert({
      booking_id: params.bookingId,
      user_id: user.id,
      property_name: params.propertyName,
      property_image: params.propertyImage,
      room_name: params.roomName,
      check_in: params.checkIn,
      check_out: params.checkOut,
      guests_adults: params.adults,
      guests_children: params.children,
      total_price: params.totalPrice,
      currency: params.currency,
      holder_first_name: params.holderFirstName,
      holder_last_name: params.holderLastName,
      holder_email: params.holderEmail,
      status: 'confirmed',
      special_requests: params.specialRequests,
      cancellation_policy: params.cancellationPolicy,
    });

    if (insertError) {
      // Retry without cancellation_policy in case column doesn't exist
      const { error: retryError } = await supabase.from('bookings').insert({
        booking_id: params.bookingId,
        user_id: user.id,
        property_name: params.propertyName,
        property_image: params.propertyImage,
        room_name: params.roomName,
        check_in: params.checkIn,
        check_out: params.checkOut,
        guests_adults: params.adults,
        guests_children: params.children,
        total_price: params.totalPrice,
        currency: params.currency,
        holder_first_name: params.holderFirstName,
        holder_last_name: params.holderLastName,
        holder_email: params.holderEmail,
        status: 'confirmed',
        special_requests: params.specialRequests,
      });

      if (retryError) {
        console.error('[saveBookingToDatabase] Error:', retryError);
        return { success: false, error: 'Failed to save booking' };
      }
    }

    // Revalidate trips page
    revalidatePath('/trips');

    return { success: true };
  } catch (error) {
    console.error('[saveBookingToDatabase] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save booking',
    };
  }
}

/**
 * Fetch user's bookings from the database.
 * Requires authentication. Returns only the authenticated user's bookings.
 */
export async function getUserBookings(): Promise<{
  success: boolean;
  data?: BookingRecord[];
  error?: string;
}> {
  try {
    const { user, supabase, error: authError } = await getAuthenticatedUser();

    if (authError || !user) {
      return { success: false, error: 'Authentication required' };
    }

    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[getUserBookings] Error:', error);
      return { success: false, error: 'Failed to fetch bookings' };
    }

    return { success: true, data: (data || []) as BookingRecord[] };
  } catch (error) {
    console.error('[getUserBookings] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch bookings',
    };
  }
}

/**
 * Update a booking's status in the database.
 * Requires authentication and ownership verification.
 */
export async function updateBookingStatus(
  bookingId: string,
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled'
): Promise<{ success: boolean; error?: string }> {
  try {
    const { user, supabase, error: authError } = await getAuthenticatedUser();

    if (authError || !user) {
      return { success: false, error: 'Authentication required' };
    }

    // Verify ownership
    const { data: booking, error: fetchError } = await supabase
      .from('bookings')
      .select('user_id')
      .eq('booking_id', bookingId)
      .single();

    if (fetchError || !booking) {
      return { success: false, error: 'Booking not found' };
    }

    if (booking.user_id !== user.id) {
      return { success: false, error: 'Not authorized to update this booking' };
    }

    const { error } = await supabase
      .from('bookings')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('booking_id', bookingId);

    if (error) {
      return { success: false, error: 'Failed to update booking status' };
    }

    revalidatePath('/trips');
    return { success: true };
  } catch (error) {
    console.error('[updateBookingStatus] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update status',
    };
  }
}
