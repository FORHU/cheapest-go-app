/**
 * Server-side data fetching for trips page.
 * Uses server Supabase client for authenticated requests.
 */

import { createClient } from '@/lib/supabase-server';
import type { BookingRecord } from '@/app/actions';

export interface TripsData {
  bookings: BookingRecord[];
  upcomingBookings: BookingRecord[];
  pastBookings: BookingRecord[];
  cancelledBookings: BookingRecord[];
}

/**
 * Fetch user's trips data server-side.
 * Returns empty data if user is not authenticated.
 */
export async function fetchTripsData(): Promise<TripsData> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return {
      bookings: [],
      upcomingBookings: [],
      pastBookings: [],
      cancelledBookings: []
    };
  }

  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch bookings:', error);
    return {
      bookings: [],
      upcomingBookings: [],
      pastBookings: [],
      cancelledBookings: []
    };
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
