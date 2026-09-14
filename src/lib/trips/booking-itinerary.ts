import type { FlightBookingRecord, FlightSegmentRecord } from '@/services/booking.service';
import type { CabinClass, FlightOffer, FlightSegmentDetail } from '@/types/flights';
import { getAirlineName } from '@/utils/flight-utils';

const KNOWN_CABIN_CLASSES = new Set<CabinClass>(['economy', 'premium_economy', 'business', 'first']);

function cabinClassOf(raw: string): CabinClass {
    return KNOWN_CABIN_CLASSES.has(raw as CabinClass) ? (raw as CabinClass) : 'economy';
}

/**
 * Elapsed minutes between two stored instants, never negative.
 *
 * Safe because both sides are `timestamp with time zone`. Do not copy this to the
 * offer side, where the same subtraction is wrong — see toSegmentDetail.
 */
export function durationMinutes(fromIso: string, toIso: string): number {
    const minutes = Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60_000);
    return Number.isFinite(minutes) && minutes > 0 ? minutes : 0;
}

/** Which leg a row belongs to, before any gap-boundary fallback is applied. */
function storedLegIndex(seg: FlightSegmentRecord): number {
    return seg.segment_index ?? seg.itinerary_index;
}

/**
 * Groups a booking's flight_segments into legs — the same rule this component already
 * applies for its own itinerary rendering (see the file-level comment there): segment_index
 * when the insert path set it, and a gap over 24 hours as the fallback for legacy rows
 * where itinerary_index is 0 on every segment and can't be trusted alone.
 */
function groupIntoLegs(segments: FlightSegmentRecord[]): FlightSegmentRecord[][] {
    if (segments.length === 0) return [];

    const sorted = [...segments].sort((a, b) => new Date(a.departure).getTime() - new Date(b.departure).getTime());
    const legs: FlightSegmentRecord[][] = [[sorted[0]]];

    for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const cur = sorted[i];
        const indexChanged = storedLegIndex(cur) !== storedLegIndex(prev);
        const gapHours = (new Date(cur.departure).getTime() - new Date(prev.arrival).getTime()) / 3_600_000;
        if (indexChanged || gapHours > 24) legs.push([cur]);
        else legs[legs.length - 1].push(cur);
    }

    return legs;
}

/**
 * One stored segment, in the shape the itinerary components read.
 *
 * `segmentIndex` here is the CORRECTED leg position (from groupIntoLegs), not the raw
 * stored column — offerSlices() re-groups by this field, so passing the raw column
 * through would reproduce the same legacy-row bug this adapter exists to route around.
 */
function toSegmentDetail(seg: FlightSegmentRecord, correctedLegIndex: number): FlightSegmentDetail {
    return {
        segmentIndex: correctedLegIndex,
        airline: { code: seg.airline, name: getAirlineName(seg.airline) },
        origin: seg.origin,
        destination: seg.destination,
        flightNumber: seg.flight_number,
        departure: { airport: seg.origin, terminal: seg.origin_terminal ?? undefined, time: seg.departure },
        arrival: { airport: seg.destination, terminal: seg.destination_terminal ?? undefined, time: seg.arrival },
        // Subtraction is correct HERE, unlike on the offer side.
        //
        // An offer's times are Local Airport Time with no UTC offset, so subtracting them
        // across two airports is wrong by the gap between their timezones — which is why
        // FlightRule and OfferSlice.durationMinutes refuse to do it. These are different:
        // flight_segments.departure/arrival are `timestamp with time zone`, so Postgres
        // returns a real instant and the difference between two of them is the elapsed
        // time, whatever timezones the two ends sit in.
        duration: durationMinutes(seg.departure, seg.arrival),
        stops: 0,
        cabinClass: cabinClassOf(seg.cabin_class),
    };
}

/**
 * A booking's segments, converted into the shape the shared itinerary components
 * (FlightItineraryDetails / FlightItineraryTimeline) already know how to draw — the same
 * component the search card and the book page use, so a traveller comparing what they
 * booked against what they searched reads one description of a journey, not three that
 * can quietly drift apart.
 *
 * Returns null when there is nothing to draw. A few FlightOffer fields have no booking
 * equivalent — price ranking, physicalFlightId — and carry inert placeholders: the
 * itinerary components read only .segments and .sliceDurations, never those.
 *
 * sliceDurations is left unset rather than computed from departure-to-arrival across a
 * whole leg: both timestamps are Local Airport Time with no UTC offset, so subtracting
 * across two different airports is wrong by the timezone gap between them. No figure
 * beats a wrong one — see FlightRule's identical choice for a single flight's duration.
 */
export function bookingToFlightOffer(booking: FlightBookingRecord): FlightOffer | null {
    const segments = booking.flight_segments ?? [];
    if (segments.length === 0) return null;

    const legs = groupIntoLegs(segments);
    const flightSegments = legs.flatMap((leg, legIndex) => leg.map(seg => toSegmentDetail(seg, legIndex)));

    return {
        offerId: booking.id,
        provider: booking.provider,
        price: { total: 0, base: 0, taxes: 0, currency: booking.currency || 'USD', pricePerAdult: 0 },
        segments: flightSegments,
        totalDuration: 0,
        totalStops: Math.max(0, flightSegments.length - legs.length),
        refundable: booking.fare_policy?.isRefundable ?? false,
        tripType: booking.trip_type,
        normalizedPriceUsd: 0,
        bestScore: 0,
        physicalFlightId: booking.id,
    };
}
