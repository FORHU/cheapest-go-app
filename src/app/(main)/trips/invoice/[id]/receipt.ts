import type { FlightSegmentRecord } from '@/services/booking.service';
import { groupIntoLegs } from '@/lib/trips/booking-itinerary';

/**
 * Formatting for the receipt page, kept apart from the page so it can be tested.
 *
 * Every flight time here is read in UTC on purpose. A segment's departure and arrival are
 * the airport's own wall clock stored in a timestamptz column, so Postgres tags them +00
 * (see fmtFlightDayDate in lib/server/email.ts). Reading them back in UTC gives the clock
 * printed on the ticket; reading them in the server's zone shifts them by that offset.
 *
 * For the same reason the receipt shows no flight durations. Subtracting two wall clocks
 * at different airports is wrong by the gap between their timezones, and a wrong duration
 * is worse than none.
 */

/** "05:01 PM", the airport's local clock. */
export function formatAirportTime(stored: string | Date): string {
    const at = new Date(stored);
    if (Number.isNaN(at.getTime())) return '';
    return at.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'UTC' });
}

/** "Wed, Sep 23", the airport's local date. */
export function formatAirportDay(stored: string | Date): string {
    const at = new Date(stored);
    if (Number.isNaN(at.getTime())) return '';
    return at.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** "Sep 23, 2026". Also right for hotel check-in/out, which are DATE columns read as UTC midnight. */
export function formatDate(stored: string | Date, style: 'short' | 'long' = 'short'): string {
    const at = new Date(stored);
    if (Number.isNaN(at.getTime())) return '';
    return at.toLocaleDateString('en-US', { month: style, day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

/**
 * "Sep 23 – Sep 26, 2026", or "Dec 30, 2026 – Jan 2, 2027" when the year changes.
 * One date when both ends fall on the same day.
 */
export function formatDateRange(from: string | Date, to: string | Date): string {
    const a = new Date(from);
    const b = new Date(to);
    if (Number.isNaN(a.getTime())) return '';
    if (Number.isNaN(b.getTime()) || a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10)) return formatDate(a);
    const sameYear = a.getUTCFullYear() === b.getUTCFullYear();
    const start = sameYear
        ? a.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
        : formatDate(a);
    return `${start} – ${formatDate(b)}`;
}

/**
 * An amount as charged, to the currency's own minor unit: "$783.60", "₩784,000".
 * Not formatCurrency, which rounds to whole units for price tags, and a receipt that
 * rounds is a receipt for a different amount.
 */
export function formatMoney(amount: number, currency: string): string {
    try {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(amount);
    } catch {
        return `${currency.toUpperCase()} ${amount.toFixed(2)}`;
    }
}

/**
 * Calendar days between departure and arrival on the local clocks, the "+1" beside an
 * arrival time. Both clocks are stored as UTC, so comparing UTC dates compares local dates.
 */
export function arrivalDayOffset(departure: string | Date, arrival: string | Date): number {
    const dayOf = (v: string | Date) => {
        const d = new Date(v);
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    };
    const days = Math.round((dayOf(arrival) - dayOf(departure)) / 86_400_000);
    return Number.isFinite(days) && days > 0 ? days : 0;
}

export type ReceiptSegment = Pick<FlightSegmentRecord, 'airline' | 'flight_number' | 'origin' | 'destination'> & {
    departure: string | Date;
    arrival?: string | Date | null;
    cabin_class?: string | null;
    segment_index?: number | null;
    itinerary_index?: number | null;
};

/** One direction of travel, from its first departure to its last arrival. */
export interface ReceiptLeg {
    segments: ReceiptSegment[];
    first: ReceiptSegment;
    last: ReceiptSegment;
    stops: number;
}

/**
 * A booking's segments grouped into legs by the rule the trips page uses (groupIntoLegs):
 * segment_index where the insert path set it, a gap over 24 hours otherwise.
 */
export function receiptLegs(segments: ReceiptSegment[]): ReceiptLeg[] {
    const usable = segments.filter(s => !Number.isNaN(new Date(s.departure).getTime()));
    return groupIntoLegs(usable as unknown as FlightSegmentRecord[]).map(leg => {
        const segs = leg as unknown as ReceiptSegment[];
        return { segments: segs, first: segs[0], last: segs[segs.length - 1], stops: segs.length - 1 };
    });
}

export type TripKind = 'oneWay' | 'roundTrip' | 'multiCity';

/**
 * What the legs describe. The stored trip_type is trusted when present; otherwise two legs
 * that come back to where they started are a round trip.
 */
export function tripKind(legs: ReceiptLeg[], storedTripType?: string | null): TripKind {
    const stored = (storedTripType ?? '').toLowerCase().replace(/[_\s]/g, '-');
    if (stored === 'round-trip') return 'roundTrip';
    if (stored === 'multi-city') return 'multiCity';
    if (stored === 'one-way') return 'oneWay';
    if (legs.length === 2 && legs[0].first.origin === legs[1].last.destination) return 'roundTrip';
    return legs.length > 1 ? 'multiCity' : 'oneWay';
}

/** "BUSILAN / BILLY DHEN CLIR", surname first as on the ticket. Uppercased by the page. */
export function travellerName(lastName?: string | null, firstName?: string | null): string {
    return [lastName, firstName].map(n => (n ?? '').trim()).filter(Boolean).join(' / ');
}

export type PassengerKind = 'adult' | 'child' | 'infant';

/** passengers.type is the ADT/CHD/INF enum; anything unrecognised is read as an adult. */
export function passengerKind(type?: string | null): PassengerKind {
    const t = (type ?? '').toUpperCase();
    if (t === 'CHD' || t === 'CHILD' || t === 'CNN') return 'child';
    if (t === 'INF' || t === 'INFANT') return 'infant';
    return 'adult';
}

export function countPassengers(passengers: { type?: string | null }[]): Record<PassengerKind, number> {
    const counts: Record<PassengerKind, number> = { adult: 0, child: 0, infant: 0 };
    for (const p of passengers) counts[passengerKind(p.type)]++;
    return counts;
}

export type ReceiptStatus = 'paid' | 'refundPending' | 'refunded' | 'cancelled' | null;

/**
 * The badge beside "E-Receipt". A receipt for money that has since gone back must not
 * say PAID. A failed booking gets no badge rather than a claim either way.
 */
export function receiptStatus(status?: string | null): ReceiptStatus {
    const s = (status ?? '').toLowerCase();
    if (s === 'failed') return null;
    if (s === 'refund_pending') return 'refundPending';
    if (s === 'refunded') return 'refunded';
    // Not cancel_requested or cancel_failed: those bookings still stand.
    if (s === 'cancelled' || s === 'cancelled_provider_missing') return 'cancelled';
    return 'paid';
}
