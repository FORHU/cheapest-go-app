/**
 * Splitting a booking's flight segments back into legs (outbound / return).
 *
 * ── Why this has to be derived ───────────────────────────────────────────────
 * `flight_segments` has two index columns and neither identifies a leg:
 *
 *   itinerary_index  intended for exactly this, but /api/internal/create-booking
 *                    never writes it, so every row sits at its default 0
 *   segment_index    written, but it is the FLAT position (0,1,2,3) taken from
 *                    the normalised offer, not a leg id
 *
 * A real round trip in the database therefore looks like:
 *
 *   GMP->CJU   itinerary_index=0   segment_index=0
 *   CJU->GMP   itinerary_index=0   segment_index=1
 *
 * Grouping on either column puts both legs together, which is why a nonstop
 * round trip reported "1 stop" and showed its outbound departure next to its
 * return arrival — reading as `GMP → GMP`.
 *
 * ── How the split is derived ─────────────────────────────────────────────────
 * `itinerary_index` is trusted whenever it actually varies, so bookings written
 * once create-booking is fixed use the real value. Otherwise the turnaround is
 * inferred from the longest gap between consecutive segments: connections within
 * a leg are short, the stay at the destination is long. Geography cannot be used
 * — a round trip is airport-continuous end to end (you depart the return from
 * where you landed), so continuity never breaks.
 */

export interface LegSegment {
    origin: string;
    destination: string;
    departure: string;
    arrival: string;
    itinerary_index?: number;
}

/** Minutes between landing and the next departure. Non-negative; 0 if unparseable. */
function gapMinutes(arrival: string, nextDeparture: string): number {
    const a = Date.parse(arrival);
    const b = Date.parse(nextDeparture);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
    return Math.max(0, Math.round((b - a) / 60_000));
}

/**
 * Split segments into legs, in travel order.
 *
 * Returns one leg for a one-way trip, two for a round trip, and — when
 * `itinerary_index` is populated — as many as the supplier recorded.
 */
export function splitFlightLegs<T extends LegSegment>(
    segments: T[] | null | undefined,
    tripType?: string | null,
): T[][] {
    const list = segments ?? [];
    if (list.length === 0) return [];
    if (list.length === 1) return [list];

    // Trust the column when it carries real information.
    const indices = new Set(list.map(s => s.itinerary_index ?? 0));
    if (indices.size > 1) {
        const groups = new Map<number, T[]>();
        for (const seg of list) {
            const key = seg.itinerary_index ?? 0;
            const bucket = groups.get(key);
            if (bucket) bucket.push(seg);
            else groups.set(key, [seg]);
        }
        return [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([, segs]) => segs);
    }

    // Only a round trip has a turnaround to find. A one-way with connections is
    // one leg however long its layovers are, and splitting it would invent a
    // return that does not exist.
    const looksRoundTrip = tripType === 'round-trip'
        || (list[0].origin && list[0].origin === list[list.length - 1].destination);
    if (!looksRoundTrip) return [list];

    // The stay at the destination is the longest gap in the itinerary.
    let turnaroundIdx = 0;
    let longest = -1;
    for (let i = 0; i < list.length - 1; i++) {
        const gap = gapMinutes(list[i].arrival, list[i + 1].departure);
        if (gap > longest) {
            longest = gap;
            turnaroundIdx = i;
        }
    }

    const outbound = list.slice(0, turnaroundIdx + 1);
    const ret = list.slice(turnaroundIdx + 1);
    return ret.length > 0 ? [outbound, ret] : [outbound];
}

/** Connections within a leg. A leg of one segment is nonstop. */
export function stopsInLeg(leg: { length: number }): number {
    return Math.max(0, leg.length - 1);
}
