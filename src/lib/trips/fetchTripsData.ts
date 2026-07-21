import { createAdminClient } from '@/utils/postgres/admin';
import { getSqlAdmin } from '@/lib/db/postgres';
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
  const { user, error: authError } = await getAuthenticatedUser();
        const supabase = createAdminClient();

  if (authError || !user) {
    return EMPTY_TRIPS;
  }

  const sql = getSqlAdmin();

  const [hotelsResponse, rawFlightBookings, rawSegments, rawPassengers] = await Promise.all([
    supabase
      .from('bookings')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    sql`SELECT * FROM flight_bookings WHERE user_id = ${user.id} ORDER BY created_at DESC`,
    sql`
      SELECT fs.* FROM flight_segments fs
      JOIN flight_bookings fb ON fb.id = fs.booking_id
      WHERE fb.user_id = ${user.id}
      ORDER BY fs.departure ASC
    `,
    sql`
      SELECT p.* FROM passengers p
      JOIN flight_bookings fb ON fb.id = p.booking_id
      WHERE fb.user_id = ${user.id}
    `,
  ]);

  if (hotelsResponse.error) {
    console.error('Failed to fetch hotel bookings:', hotelsResponse.error);
  }

  // Group segments and passengers by booking_id
  const segmentsByBooking = new Map<string, any[]>();
  for (const seg of rawSegments) {
    const id = seg.booking_id;
    if (!segmentsByBooking.has(id)) segmentsByBooking.set(id, []);
    segmentsByBooking.get(id)!.push(seg);
  }
  const passengersByBooking = new Map<string, any[]>();
  for (const pax of rawPassengers) {
    const id = pax.booking_id;
    if (!passengersByBooking.has(id)) passengersByBooking.set(id, []);
    passengersByBooking.get(id)!.push(pax);
  }

  const bookings = (hotelsResponse.data || []) as BookingRecord[];
  const flightBookings = rawFlightBookings.map((fb: any) => ({
    ...fb,
    flight_segments: segmentsByBooking.get(fb.id) ?? [],
    passengers: passengersByBooking.get(fb.id) ?? [],
  })) as FlightBookingRecord[];
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
