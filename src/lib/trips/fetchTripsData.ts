/**
 * Server-side data fetching for trips page.
 * Uses shared server auth utility for authenticated requests.
 */

import { getAuthenticatedUser } from '@/lib/server/auth';
import type { BookingRecord, FlightBookingRecord } from '@/services/booking.service';

export interface TripsData {
  bookings: BookingRecord[];
  upcomingBookings: BookingRecord[];
  pastBookings: BookingRecord[];
  cancelledBookings: BookingRecord[];

  flightBookings: FlightBookingRecord[];
  upcomingFlightBookings: FlightBookingRecord[];
  pastFlightBookings: FlightBookingRecord[];
  cancelledFlightBookings: FlightBookingRecord[];
}

const EMPTY_TRIPS: TripsData = {
  bookings: [],
  upcomingBookings: [],
  pastBookings: [],
  cancelledBookings: [],

  flightBookings: [],
  upcomingFlightBookings: [],
  pastFlightBookings: [],
  cancelledFlightBookings: [],
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

  const [hotelsResponse, flightsResponse] = await Promise.all([
    supabase
      .from('bookings')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('flight_bookings')
      .select('*, flight_segments(*), passengers(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
  ]);

  if (hotelsResponse.error) {
    console.error('Failed to fetch hotel bookings:', hotelsResponse.error);
  }
  if (flightsResponse.error) {
    console.error('Failed to fetch flight bookings:', flightsResponse.error);
  }

  const bookings = (hotelsResponse.data || []) as BookingRecord[];
  const flightBookings = (flightsResponse.data || []) as FlightBookingRecord[];
  const now = new Date();

  const CANCELLED_STATUSES: BookingRecord['status'][] = ['cancelled', 'cancelled_refunded', 'cancelled_refund_failed'];
  const isCancelledHotel = (b: BookingRecord) => CANCELLED_STATUSES.includes(b.status);

  return {
    bookings,
    upcomingBookings: bookings.filter(
      b => new Date(b.check_in) >= now && !isCancelledHotel(b)
    ),
    pastBookings: bookings.filter(
      b => !isCancelledHotel(b) && (new Date(b.check_out) < now || b.status === 'completed')
    ),
    cancelledBookings: bookings.filter(isCancelledHotel),

    flightBookings,
    upcomingFlightBookings: flightBookings.filter(b => {
      if (b.status === 'cancelled' || b.status === 'failed') return false;
      const firstSegment = b.flight_segments?.[0];
      if (!firstSegment) return true;
      return new Date(firstSegment.departure) >= now;
    }),
    pastFlightBookings: flightBookings.filter(b => {
      if (b.status === 'cancelled' || b.status === 'failed') return false;
      const lastSegment = b.flight_segments?.[b.flight_segments.length - 1];
      if (!lastSegment) return false;
      return new Date(lastSegment.arrival) < now;
    }),
    cancelledFlightBookings: flightBookings.filter(b =>
      b.status === 'cancelled' || b.status === 'failed'
    ),
  };
}
