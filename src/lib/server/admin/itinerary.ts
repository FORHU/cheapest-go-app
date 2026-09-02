import type { BookingItinerary, FlightSegmentSummary, PassengerSummary } from '@/types/admin';

/**
 * Describe what a booking actually is, for the admin list and detail view.
 *
 * The admin was built around money and recovery — supplier cost, markup, profit, PNR,
 * ticket status — and carried nothing naming the trip. An agent taking a call about
 * "the Hilton on the 9th" could match the caller only by name, email or reference,
 * because the property, room, dates, airline and route were absent from the view even
 * though all of them are stored.
 */

/** "9 Sep – 11 Sep", or a single date when there is only one to show. */
export function dateRange(from?: string | Date | null, to?: string | Date | null): string {
    const fmt = (d: string | Date) => {
        const parsed = new Date(d);
        return isNaN(parsed.getTime())
            ? ''
            : parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    };
    if (!from) return '';
    const start = fmt(from);
    if (!start) return '';
    const end = to ? fmt(to) : '';
    return end ? `${start} – ${end}` : start;
}

/**
 * Postgres `date`/`timestamp` columns arrive from postgres.js as `Date` objects, not
 * strings, and callers pass the row through as `any` so the declared `string | null`
 * never gets checked. A `Date` that reaches JSX throws "Objects are not valid as a React
 * child" — which is exactly what opening any hotel booking in the admin detail dialog
 * did. Normalise here so `BookingItinerary` genuinely holds strings, whatever the driver
 * hands back.
 */
function isoOrUndefined(v: string | Date | null | undefined): string | undefined {
    if (!v) return undefined;
    if (v instanceof Date) return isNaN(v.getTime()) ? undefined : v.toISOString();
    return v;
}

export function hotelItinerary(row: {
    property_name?: string | null;
    room_name?: string | null;
    check_in?: string | Date | null;
    check_out?: string | Date | null;
    guests_adults?: number | null;
    guests_children?: number | null;
}): BookingItinerary {
    const stay = dateRange(row.check_in, row.check_out);
    return {
        propertyName: row.property_name || undefined,
        roomName:     row.room_name || undefined,
        checkIn:      isoOrUndefined(row.check_in),
        checkOut:     isoOrUndefined(row.check_out),
        adults:       row.guests_adults ?? undefined,
        children:     row.guests_children ?? undefined,
        // Falls back to the room, then to a plain label, so the column is never blank —
        // an empty cell reads as a loading fault rather than as missing data.
        summary: [row.property_name || row.room_name || 'Hotel booking', stay].filter(Boolean).join(' · '),
    };
}

export function flightItinerary(
    segments: FlightSegmentSummary[],
    passengers: PassengerSummary[],
): BookingItinerary {
    const first = segments[0];
    const last  = segments[segments.length - 1];

    // Named by the whole journey rather than the first leg. A connecting itinerary
    // should read MNL→NRT; showing MNL→ICN hides where the traveller is going, which
    // is the one thing the column exists to answer.
    const route = first
        ? `${first.origin}→${segments.length > 1 ? last.destination : first.destination}`
        : '';
    const flightNo = first ? `${first.airline} ${first.flightNumber}`.trim() : '';
    const when = first?.departure ? dateRange(first.departure) : '';

    return {
        segments:   segments.length ? segments : undefined,
        passengers: passengers.length ? passengers : undefined,
        summary: [flightNo, route, when].filter(Boolean).join(' · ') || 'Flight booking',
    };
}
