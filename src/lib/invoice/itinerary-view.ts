/**
 * Groups flight segments into the slices a receipt draws (Depart / Return / Flight N)
 * and derives the one-line trip summary (route, trip type, dates) shown in the
 * reference band. Shared by the web page and the PDF so the two documents cannot state
 * a different route or duration for the same booking — see ADR-0042 on the drift this
 * codebase has already paid for once.
 *
 * Every figure here is derived from `flight_segments` and `trip_type`, both already
 * recorded on `flight_bookings`. Nothing is estimated or looked up.
 */

export interface ItinerarySegmentInput {
    airline: string;
    flight_number: string;
    origin: string;
    destination: string;
    departure: string | Date;
    arrival: string | Date;
    cabin_class?: string | null;
    itinerary_index?: number | null;
}

export interface ItinerarySlice {
    /** 'Depart' for a trip's first slice, 'Return' for its second, 'Flight N' beyond that. */
    label: 'depart' | 'return' | number;
    flightNumber: string;
    cabinClass: string;
    origin: string;
    destination: string;
    departure: Date;
    arrival: Date;
    /** Days the arrival lands after the departure's calendar day (local), e.g. 1 for a "+1" badge. */
    arrivalDayOffset: number;
    durationMinutes: number;
    /** Segments in this slice minus one — 0 is direct. */
    stops: number;
}

export interface TripSummary {
    origin: string;
    destination: string;
    tripType: string | null;
    /** The outbound slice's departure date. */
    startDate: Date;
    /** The second slice's departure date, or null for anything but a round trip. */
    endDate: Date | null;
}

/**
 * Compared on UTC calendar days rather than the server process's local time zone, so
 * the same booking prints the same "+1" badge in dev, in CI, and in production instead
 * of one that depends on where the renderer happens to run. Every date this module and
 * its renderers print for a segment must use the same `timeZone: 'UTC'` basis, or the
 * badge and the printed dates could disagree.
 */
function dayOffset(from: Date, to: Date): number {
    const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
    const b = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
    return Math.round((b - a) / 86_400_000);
}

/**
 * Segments are grouped by `itinerary_index` (the slice a segment belongs to) and each
 * group is reduced to its first departure and last arrival, so a connection's layover
 * counts toward the slice's duration and stop count exactly once.
 */
export function buildItinerarySlices(segments: ItinerarySegmentInput[]): ItinerarySlice[] {
    const bySlice = new Map<number, ItinerarySegmentInput[]>();
    for (const seg of segments) {
        const idx = seg.itinerary_index ?? 0;
        const list = bySlice.get(idx) ?? [];
        list.push(seg);
        bySlice.set(idx, list);
    }

    const sliceOrder = [...bySlice.keys()].sort((a, b) => a - b);

    return sliceOrder.map((idx, position) => {
        const segs = bySlice.get(idx)!
            .slice()
            .sort((a, b) => new Date(a.departure).getTime() - new Date(b.departure).getTime());

        const first = segs[0];
        const last = segs[segs.length - 1];
        const departure = new Date(first.departure);
        const arrival = new Date(last.arrival);

        return {
            label: position === 0 ? 'depart' : position === 1 ? 'return' : position + 1,
            flightNumber: `${first.airline} ${first.flight_number}`.trim(),
            cabinClass: first.cabin_class || 'economy',
            origin: first.origin,
            destination: last.destination,
            departure,
            arrival,
            arrivalDayOffset: dayOffset(departure, arrival),
            durationMinutes: Math.round((arrival.getTime() - departure.getTime()) / 60_000),
            stops: Math.max(0, segs.length - 1),
        };
    });
}

/** "14h 49m", or "45m" under an hour. Empty for anything that cannot be a real duration. */
export function formatDurationShort(minutes: number): string {
    if (!Number.isFinite(minutes) || minutes <= 0) return '';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m}m`;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/**
 * The route and dates belong to the outbound slice: for a one-way this is the whole
 * trip, and for a round trip the return leg does not change where "the trip" went.
 */
export function tripSummaryFromSlices(
    slices: ItinerarySlice[],
    tripType: string | null | undefined,
): TripSummary | null {
    if (slices.length === 0) return null;
    const [outbound, inbound] = slices;

    return {
        origin: outbound.origin,
        destination: outbound.destination,
        tripType: tripType ?? null,
        startDate: outbound.departure,
        endDate: inbound ? inbound.departure : null,
    };
}
