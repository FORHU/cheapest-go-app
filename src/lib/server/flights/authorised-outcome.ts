/** A fare that moved while we were ordering, in bare fares (never including seats or bags). */
export interface PriceChange {
    oldPrice: number;
    newPrice: number;
    currency: string;
}

/** Why a session ended without a booking, as the traveller should be told it. */
export interface SessionFailure {
    errorCode: string;
    priceChange?: PriceChange;
}

/** What finalising an authorised Duffel intent came to. */
export type FinaliseOutcome =
    /** A booking exists (this call made it, or another path did: `alreadyBooked`). */
    | { kind: 'booked'; bookingId?: string; pnr?: string; status?: string; alreadyBooked: boolean }
    /** Nothing was bought and the hold has been released. */
    | { kind: 'refused'; errorCode: string; priceChange?: PriceChange }
    /** Another path owns this session, or it is mid-flight; nothing was decided here. */
    | { kind: 'in_progress' }
    /** The intent is not one this flow handles, or the card is not authorised. */
    | { kind: 'not_authorised'; reason: string };
