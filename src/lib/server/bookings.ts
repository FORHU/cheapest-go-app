import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Verify that a booking belongs to the given user.
 * Returns { isOwner, error } — caller decides how to handle unauthorized access.
 */
export async function verifyBookingOwnership(
  supabase: SupabaseClient,
  bookingId: string,
  userId: string,
): Promise<{ isOwner: boolean; error?: string }> {
  const { data: booking, error: fetchError } = await supabase
    .from('bookings')
    .select('user_id')
    .eq('booking_id', bookingId)
    .single();

  if (fetchError || !booking) {
    return { isOwner: false, error: 'Booking not found' };
  }

  if (booking.user_id !== userId) {
    return { isOwner: false, error: 'Not authorized' };
  }

  return { isOwner: true };
}
