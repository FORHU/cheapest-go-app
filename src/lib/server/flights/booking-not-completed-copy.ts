/** Pure helpers for the "we couldn't complete your booking" email. No I/O. */

export function notCompletedReasonCopy(reason: string | null | undefined): string {
    switch (reason) {
        case 'price_changed':
            return 'The fare changed while we were confirming it with the airline.';
        case 'flight_unavailable':
            return 'This flight is no longer available.';
        case 'seats_unavailable':
            return 'The seats or bags you selected are no longer available.';
        case 'phone_number_invalid':
            return 'The airline rejected the contact phone number.';
        case 'duplicate_attempt':
            return 'You already have a booking for this flight in progress, so we did not take a second payment.';
        case 'superseded':
            return 'You changed your booking details, so we cancelled this earlier payment.';
        default:
            return 'The airline could not confirm the booking.';
    }
}

export interface NotCompletedSegment {
    airline: string;
    airlineName?: string;
    flightNumber: string;
    origin: string;
    destination: string;
    departureTime: string;
    arrivalTime: string;
    itineraryIndex?: number;
    cabinClass?: string;
}

/** The session stores the client's normalised segments; the email wants this subset. */
export function segmentsForNotCompletedEmail(flight: any): NotCompletedSegment[] {
    const segments: any[] = Array.isArray(flight?.segments) ? flight.segments : [];
    return segments.map(s => ({
        airline: s.airline,
        airlineName: s.airlineName,
        flightNumber: s.flightNumber,
        origin: s.origin,
        destination: s.destination,
        departureTime: s.departureTime,
        arrivalTime: s.arrivalTime,
        cabinClass: s.cabinClass,
        itineraryIndex: s.segmentIndex ?? s.itineraryIndex,
    }));
}
