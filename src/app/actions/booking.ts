'use server';

/**
 * Server Actions for booking operations.
 * All LiteAPI calls are proxied through Supabase Edge Functions,
 * keeping API keys and business logic server-side.
 *
 * All inputs are validated with Zod schemas before processing.
 */

import { createClient } from '@/utils/supabase/server';
import { invokeEdgeFunction } from '@/utils/supabase/functions';
import { revalidatePath } from 'next/cache';
import {
  prebookSchema,
  bookingConfirmSchema,
  amendBookingSchema,
  saveBookingSchema,
} from '@/lib/schemas';
import type {
  PrebookParams,
  BookingParams,
  AmendBookingParams,
  SaveBookingParams,
  PrebookResult,
  BookingResult,
  CancelBookingResult,
  AmendBookingResult,
  BookingDetailsResult,
  GetUserBookingsResult,
} from './types';

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
  // Validate input
  const validation = prebookSchema.safeParse(params);
  if (!validation.success) {
    const firstError = validation.error.issues[0];
    return { success: false, error: firstError?.message || 'Invalid input' };
  }

  try {
    const { user, error: authError } = await getAuthenticatedUser();

    if (authError || !user) {
      return { success: false, error: 'Authentication required' };
    }

    const result = await invokeEdgeFunction('liteapi-prebook-v2', validation.data);

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
  // Validate input
  const validation = bookingConfirmSchema.safeParse(params);
  if (!validation.success) {
    const firstError = validation.error.issues[0];
    return { success: false, error: firstError?.message || 'Invalid input' };
  }

  try {
    const { user, error: authError } = await getAuthenticatedUser();

    if (authError || !user) {
      return { success: false, error: 'Authentication required' };
    }

    const result = await invokeEdgeFunction('liteapi-book-v2', validation.data);

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
  // Validate input
  if (!bookingId || typeof bookingId !== 'string' || bookingId.trim().length === 0) {
    return { success: false, error: 'Booking ID is required' };
  }

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
  // Validate input
  const validation = amendBookingSchema.safeParse(params);
  if (!validation.success) {
    const firstError = validation.error.issues[0];
    return { success: false, error: firstError?.message || 'Invalid input' };
  }

  try {
    const { user, supabase, error: authError } = await getAuthenticatedUser();

    if (authError || !user) {
      return { success: false, error: 'Authentication required' };
    }

    // Verify ownership
    const { data: booking, error: fetchError } = await supabase
      .from('bookings')
      .select('user_id')
      .eq('booking_id', validation.data.bookingId)
      .single();

    if (fetchError || !booking) {
      return { success: false, error: 'Booking not found' };
    }

    if (booking.user_id !== user.id) {
      return { success: false, error: 'Not authorized to modify this booking' };
    }

    // Call LiteAPI to amend
    const result = await invokeEdgeFunction('liteapi-amend-booking', validation.data);

    // Update local database
    await supabase
      .from('bookings')
      .update({
        holder_first_name: validation.data.firstName,
        holder_last_name: validation.data.lastName,
        holder_email: validation.data.email,
        special_requests: validation.data.remarks,
        updated_at: new Date().toISOString(),
      })
      .eq('booking_id', validation.data.bookingId);

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
  // Validate input
  if (!bookingId || typeof bookingId !== 'string' || bookingId.trim().length === 0) {
    return { success: false, error: 'Booking ID is required' };
  }

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
export async function saveBookingToDatabase(
  params: SaveBookingParams
): Promise<{ success: boolean; error?: string }> {
  // Validate input
  const validation = saveBookingSchema.safeParse(params);
  if (!validation.success) {
    const firstError = validation.error.issues[0];
    return { success: false, error: firstError?.message || 'Invalid input' };
  }

  try {
    const { user, supabase, error: authError } = await getAuthenticatedUser();

    if (authError || !user) {
      return { success: false, error: 'Authentication required' };
    }

    const data = validation.data;

    const { error: insertError } = await supabase.from('bookings').insert({
      booking_id: data.bookingId,
      user_id: user.id,
      property_name: data.propertyName,
      property_image: data.propertyImage,
      room_name: data.roomName,
      check_in: data.checkIn,
      check_out: data.checkOut,
      guests_adults: data.adults,
      guests_children: data.children,
      total_price: data.totalPrice,
      currency: data.currency,
      holder_first_name: data.holderFirstName,
      holder_last_name: data.holderLastName,
      holder_email: data.holderEmail,
      status: 'confirmed',
      special_requests: data.specialRequests,
      cancellation_policy: data.cancellationPolicy,
    });

    if (insertError) {
      // Retry without cancellation_policy in case column doesn't exist
      const { error: retryError } = await supabase.from('bookings').insert({
        booking_id: data.bookingId,
        user_id: user.id,
        property_name: data.propertyName,
        property_image: data.propertyImage,
        room_name: data.roomName,
        check_in: data.checkIn,
        check_out: data.checkOut,
        guests_adults: data.adults,
        guests_children: data.children,
        total_price: data.totalPrice,
        currency: data.currency,
        holder_first_name: data.holderFirstName,
        holder_last_name: data.holderLastName,
        holder_email: data.holderEmail,
        status: 'confirmed',
        special_requests: data.specialRequests,
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
 * Get the authenticated user's bookings from the database.
 * Filters by user_id server-side for security.
 */
export async function getUserBookings(): Promise<GetUserBookingsResult> {
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

    return { success: true, data: data || [] };
  } catch (error) {
    console.error('[getUserBookings] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch bookings',
    };
  }
}
