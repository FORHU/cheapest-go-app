import type { FlightOffer, FlightSegmentDetail } from '@/types/flights';
import { layoverMinutes } from '@/utils/flight-utils';

/**
 * One slice of an offer — an outbound, a return, a leg of a multi-city trip — described
 * only in its own terms. Every field here answers a question about a single journey the
 * traveller takes: where it starts, where it ends, how long it runs, how many times they
 * change plane. Offer-wide figures (`totalStops`, `totalDuration`) answer none of those,
 * which is why a strip that shows one slice must never reach for them.
 */
export interface OfferSlice {
    /** The `segmentIndex` its segments carry: 0 outbound, 1 return, and so on. */
    sliceIndex: number;
    segments: FlightSegmentDetail[];
    /** Plane changes on this slice alone — never the sum across the trip. */
    stops: number;
    departure: FlightSegmentDetail['departure'];
    arrival: FlightSegmentDetail['arrival'];
    /**
     * The provider's own quoted elapsed time for this slice. Absent when no provider
     * quoted one: the timestamps carry no UTC offset, so subtracting them is wrong by
     * the timezone gap between origin and destination, and no figure beats a wrong one.
     */
    durationMinutes?: number;
    /**
     * Each connection on this slice: how long on the ground, and where. Both times are
     * at the same airport, so their shared offset cancels and the subtraction is exact.
     */
    layovers: { airport: string; minutes: number }[];
}

/**
 * Splits an offer into the slices a traveller actually flies.
 *
 * Segments missing a `segmentIndex` all land in slice 0 rather than being split down the
 * middle: guessing at the halfway point invented a return leg out of a one-way's second
 * half, so an unlabelled journey is treated as the single slice it probably is.
 */
export function offerSlices(offer: FlightOffer): OfferSlice[] {
    const groups = new Map<number, FlightSegmentDetail[]>();

    for (const segment of offer.segments) {
        const index = segment.segmentIndex ?? 0;
        const group = groups.get(index);
        if (group) group.push(segment);
        else groups.set(index, [segment]);
    }

    return [...groups.keys()]
        .sort((a, b) => a - b)
        .map(sliceIndex => {
            const segments = groups.get(sliceIndex)!;
            return {
                sliceIndex,
                segments,
                stops: Math.max(0, segments.length - 1),
                departure: segments[0].departure,
                arrival: segments[segments.length - 1].arrival,
                durationMinutes: offer.sliceDurations?.[sliceIndex],
                layovers: segments.slice(0, -1).map((segment, i) => ({
                    airport: segment.arrival.airport,
                    minutes: layoverMinutes(segment.arrival.time, segments[i + 1]?.departure.time),
                })),
            };
        });
}
