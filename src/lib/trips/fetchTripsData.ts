/**
 * Server-side data fetching for trips page.
 * Uses shared server auth utility for authenticated requests.
 */

import { getAuthenticatedUser } from '@/lib/server/auth';
import type { BookingRecord } from '@/services/booking.service';

export interface TripsData {
  bookings: BookingRecord[];
  upcomingBookings: BookingRecord[];
  pastBookings: BookingRecord[];
  cancelledBookings: BookingRecord[];
}

const EMPTY_TRIPS: TripsData = {
  bookings: [],
  upcomingBookings: [],
  pastBookings: [],
  cancelledBookings: [],
};

/**
 * Fetch user's trips data server-side.
 * Returns empty data if user is not authenticated.
 */
export async function fetchTripsData(): Promise<TripsData> {
  const { user, supabase, error: authError } = await getAuthenticatedUser();

  if (authError || !user) {
    return EMPTY_TRIPS;
  }

  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch bookings:', error);
    return EMPTY_TRIPS;
  }

  const bookings = (data || []) as BookingRecord[];
  const now = new Date();

  return {
    bookings,
    upcomingBookings: bookings.filter(
      b => new Date(b.check_in) >= now && b.status !== 'cancelled'
    ),
    pastBookings: bookings.filter(
      b => new Date(b.check_out) < now || b.status === 'completed'
    ),
    cancelledBookings: bookings.filter(b => b.status === 'cancelled'),
  };
}
