import type { FlightSegmentDetail } from '@/types/flights';
import { getAirportByCode } from '@/lib/airports';
import { segmentTerminal } from './terminal-fallback';
import type { OfferSlice } from './offer-slices';

/** One end of a flight: when it happens, and where, named the way a sign at the airport names it. */
export interface TimelineStop {
    /** Local Airport Time, offset-less — format it with formatDateTimeIn, never a bare Date. */
    time: string;
    airportCode: string;
    /** The airport's full name, or the bare code when it is not one we know. */
    airportName: string;
    terminal?: string;
}

/** One flight in a slice, plus the wait that follows it. */
export interface TimelineLeg {
    segment: FlightSegmentDetail;
    departure: TimelineStop;
    arrival: TimelineStop;
    /** The provider's own figure for this flight. Absent when none was quoted. */
    durationMinutes?: number;
    /** The connection AFTER this leg. Absent on the last leg — nothing follows an arrival. */
    layover?: { airportCode: string; airportName: string; minutes: number };
}

function stop(seg: FlightSegmentDetail, end: 'departure' | 'arrival'): TimelineStop {
    const point = seg[end];
    const code = point.airport;
    return {
        time: point.time,
        airportCode: code,
        // A code we do not carry is shown as itself. Inventing a name would be worse
        // than showing the three letters printed on the boarding pass.
        airportName: getAirportByCode(code)?.name ?? code,
        // The provider's terminal if it gave one, else the carrier's standing gate.
        terminal: segmentTerminal(seg, end),
    };
}

/**
 * A slice as the traveller walks it: depart, fly, arrive, wait, depart again.
 *
 * The layover belongs to the leg it follows, so the final leg carries none. Pairing them
 * here rather than in the markup keeps the off-by-one visible: a phantom connection after
 * the last arrival fails a test instead of quietly rendering a journey that never ends.
 */
export function sliceTimeline(slice: OfferSlice): TimelineLeg[] {
    return slice.segments.map((segment, i) => {
        const layover = slice.layovers[i];
        return {
            segment,
            departure: stop(segment, 'departure'),
            arrival: stop(segment, 'arrival'),
            durationMinutes: segment.duration > 0 ? segment.duration : undefined,
            layover: layover
                ? {
                      airportCode: layover.airport,
                      airportName: getAirportByCode(layover.airport)?.name ?? layover.airport,
                      minutes: layover.minutes,
                  }
                : undefined,
        };
    });
}
