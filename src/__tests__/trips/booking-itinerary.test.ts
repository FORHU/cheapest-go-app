import { describe, it, expect } from 'vitest';
import { bookingToFlightOffer } from '@/lib/trips/booking-itinerary';
import { formatBookingTime, formatTimeIn } from '@/utils/flight-utils';
import type { FlightBookingRecord, FlightSegmentRecord } from '@/services/booking.service';

/**
 * A booking's segments, converted into the shape the shared itinerary components
 * (FlightItineraryDetails / FlightItineraryTimeline) already know how to draw — the same
 * component the search card and the book page use, so a traveller comparing what they
 * booked against what they searched reads one description of a journey, not three that
 * can quietly drift apart.
 */

function seg(over: Partial<FlightSegmentRecord> = {}): FlightSegmentRecord {
    return {
        id: 's1',
        booking_id: 'b1',
        airline: 'QR',
        flight_number: 'QR0927',
        origin: 'CRK',
        destination: 'DOH',
        departure: '2026-09-23T18:40:00',
        arrival: '2026-09-23T22:30:00',
        itinerary_index: 0,
        segment_index: 0,
        ...over,
    };
}

function booking(over: Partial<FlightBookingRecord> = {}): FlightBookingRecord {
    return {
        id: 'b1',
        user_id: 'u1',
        pnr: 'CG2MTN',
        provider: 'duffel',
        total_price: 354,
        status: 'ticketed',
        created_at: '2026-09-01T00:00:00Z',
        ...over,
    };
}

describe('bookingToFlightOffer', () => {
    it('returns null for a booking with no flight segments', () => {
        expect(bookingToFlightOffer(booking({ flight_segments: [] }))).toBeNull();
        expect(bookingToFlightOffer(booking({ flight_segments: undefined }))).toBeNull();
    });

    it('keeps departure time as departure and arrival time as arrival — not swapped', () => {
        const offer = bookingToFlightOffer(booking({
            flight_segments: [seg({ departure: '2026-09-23T18:40:00', arrival: '2026-09-23T22:30:00' })],
        }));

        expect(offer!.segments[0].departure.time).toBe('2026-09-23T18:40:00');
        expect(offer!.segments[0].arrival.time).toBe('2026-09-23T22:30:00');
    });

    /**
     * What the trips list actually hands this adapter.
     *
     * fetchTripsData reads flight_segments with `SELECT fs.*`, and the SQL driver parses
     * `timestamp with time zone` into Date objects before React serialises them — Dates
     * survive the server-to-client boundary intact. The row is typed as a string, so
     * nothing complained until the itinerary tried to slice one and threw
     * "iso.slice is not a function".
     */
    it('accepts a stored instant as a Date, which is what the trips list passes', () => {
        const offer = bookingToFlightOffer(booking({
            flight_segments: [seg({
                departure: new Date('2026-09-23T10:40:00.000Z') as unknown as string,
                arrival: new Date('2026-09-23T14:30:00.000Z') as unknown as string,
            })],
        }));

        expect(typeof offer!.segments[0].departure.time).toBe('string');
        expect(typeof offer!.segments[0].arrival.time).toBe('string');
    });

    /**
     * The card states each clock twice — once in the summary header, once in the expanded
     * itinerary — and the two read it through different formatters: the header builds a
     * Date, the itinerary reads the digits out of the string. An instant handed over
     * unconverted makes them disagree by the viewer's UTC offset.
     */
    it('states an instant as the same clock the summary header shows', () => {
        const instant = new Date('2026-09-23T10:40:00.000Z');
        const offer = bookingToFlightOffer(booking({
            flight_segments: [seg({ departure: instant as unknown as string })],
        }));

        expect(formatTimeIn(offer!.segments[0].departure.time)).toBe(formatBookingTime(instant.toISOString()));
    });

    it('carries the terminal the airline gave, into the shape the itinerary reads', () => {
        const offer = bookingToFlightOffer(booking({
            flight_segments: [seg({ origin_terminal: '1', destination_terminal: '2' })],
        }));

        expect(offer!.segments[0].departure.terminal).toBe('1');
        expect(offer!.segments[0].arrival.terminal).toBe('2');
    });

    it('leaves the terminal unset when the airline gave none, rather than inventing one', () => {
        const offer = bookingToFlightOffer(booking({
            flight_segments: [seg({ origin_terminal: null, destination_terminal: null })],
        }));

        expect(offer!.segments[0].departure.terminal).toBeUndefined();
        expect(offer!.segments[0].arrival.terminal).toBeUndefined();
    });

    it('carries the cabin class the ticket was issued in', () => {
        const offer = bookingToFlightOffer(booking({
            flight_segments: [seg({ cabin_class: 'business' })],
        }));

        expect(offer!.segments[0].cabinClass).toBe('business');
    });

    it('groups segments into legs by segment_index, the same way the outbound/return split already works elsewhere in this file', () => {
        const offer = bookingToFlightOffer(booking({
            flight_segments: [
                seg({ id: 's1', origin: 'CRK', destination: 'DOH', departure: '2026-09-23T18:40:00', arrival: '2026-09-23T22:30:00', segment_index: 0 }),
                seg({ id: 's2', origin: 'DOH', destination: 'LHR', departure: '2026-09-24T01:15:00', arrival: '2026-09-24T06:30:00', segment_index: 0 }),
                seg({ id: 's3', origin: 'LHR', destination: 'CRK', departure: '2026-09-30T09:00:00', arrival: '2026-10-01T06:40:00', segment_index: 1 }),
            ],
        }));

        expect(offer!.segments.map(s => s.segmentIndex)).toEqual([0, 0, 1]);
    });

    it('falls back to a 24-hour gap as a leg boundary when segment_index and itinerary_index both say 0', () => {
        // The legacy-row bug this file's own itineraryLegs already works around: every
        // segment carries the same (unset) index, so the boundary has to be found some
        // other way — a genuine multi-day gap between arrival and the next departure.
        const offer = bookingToFlightOffer(booking({
            flight_segments: [
                seg({ id: 's1', origin: 'CRK', destination: 'DOH', departure: '2026-09-23T18:40:00', arrival: '2026-09-23T22:30:00', segment_index: 0, itinerary_index: 0 }),
                seg({ id: 's2', origin: 'DOH', destination: 'LHR', departure: '2026-09-30T09:00:00', arrival: '2026-09-30T14:00:00', segment_index: 0, itinerary_index: 0 }),
            ],
        }));

        expect(offer!.segments.map(s => s.segmentIndex)).toEqual([0, 1]);
    });

    it("computes each flight's duration, because these timestamps are absolute instants", () => {
        // Unlike the offer-side segments — Local Airport Time with no offset, where
        // subtracting across two airports is wrong by the gap between their timezones —
        // flight_segments.departure/arrival are `timestamp with time zone`: Postgres
        // hands back a real instant. Clark 10:40Z to Doha 19:30Z is 8h 50m, and
        // subtracting is the right way to get it.
        const offer = bookingToFlightOffer(booking({
            flight_segments: [seg({
                departure: '2026-09-23T10:40:00.000Z',
                arrival: '2026-09-23T19:30:00.000Z',
            })],
        }));

        expect(offer!.segments[0].duration).toBe(530); // 8h 50m
    });

    it('names the airline in full, not just its code', () => {
        const offer = bookingToFlightOffer(booking({
            flight_segments: [seg({ airline: 'QR' })],
        }));

        expect(offer!.segments[0].airline.name).toBe('Qatar Airways');
    });
});
