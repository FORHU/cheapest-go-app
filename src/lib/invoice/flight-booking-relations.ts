import { createAdminClient } from '@/utils/postgres/admin';

/**
 * Loads a flight booking's segments and passengers.
 *
 * Both receipt renderers asked for these with Supabase embed syntax —
 * `select('*, flight_segments(*), passengers(*)')` — which this codebase's query
 * builder does not implement. `parseColumns` drops any selector containing a
 * bracket and its comment says the embeds are "handled via JOIN"; no JOIN exists.
 * The call succeeded, returned the base row, and the relations came back
 * undefined, so every flight receipt rendered an empty itinerary and an empty
 * passenger list without anything failing.
 *
 * Two explicit reads are the narrow fix. Teaching the query builder real embeds
 * would also repair `admin/communication.ts`, which has the same silent gap, but
 * that is a change to a client the whole application shares.
 */

export interface FlightSegmentRow {
    airline: string;
    flight_number: string;
    origin: string;
    destination: string;
    departure: string;
    arrival: string;
    itinerary_index: number;
}

export interface FlightPassengerRow {
    first_name: string;
    last_name: string;
    type: string;
    ticket_number: string | null;
    seat_number: string | null;
}

export interface FlightBookingRelations {
    segments: FlightSegmentRow[];
    passengers: FlightPassengerRow[];
}

/**
 * Ordered the way the traveller flies: by slice, then by departure time. The
 * relations are read separately rather than joined so that one missing set does
 * not cost the other — a booking whose passengers failed to record still shows
 * its itinerary.
 */
export async function loadFlightBookingRelations(bookingId: string): Promise<FlightBookingRelations> {
    const db = createAdminClient();

    const [segmentsResult, passengersResult] = await Promise.all([
        db.from('flight_segments').select('*').eq('booking_id', bookingId),
        db.from('passengers').select('*').eq('booking_id', bookingId),
    ]);

    const segments = ((segmentsResult.data as FlightSegmentRow[] | null) ?? []).slice().sort((a, b) => {
        const bySlice = (a.itinerary_index ?? 0) - (b.itinerary_index ?? 0);
        if (bySlice !== 0) return bySlice;
        return new Date(a.departure).getTime() - new Date(b.departure).getTime();
    });

    return {
        segments,
        passengers: (passengersResult.data as FlightPassengerRow[] | null) ?? [],
    };
}

/**
 * The fare before tax that the airline quoted, taken from the offer stored against the
 * booking's session.
 *
 * It lives there rather than on `flight_bookings` because the session's `flight` column
 * holds the whole offer document, and `FlightPrice.base` rides along inside it. Bookings
 * taken before Duffel's `base_amount` was parsed hold a zero there, which reads as
 * "not recorded" and yields no breakdown — see ADR-0042.
 */
export async function loadFlightFareBase(
    sessionId: string | null | undefined,
): Promise<{ base: number; currency: string | null } | null> {
    if (!sessionId) return null;

    const db = createAdminClient();
    const { data } = await db.from('booking_sessions').select('*').eq('id', sessionId).single();
    if (!data) return null;

    const price = (data as any)?.flight?.price;
    const base = Number(price?.base);
    if (!Number.isFinite(base) || base <= 0) return null;

    return { base, currency: typeof price?.currency === 'string' ? price.currency : null };
}
