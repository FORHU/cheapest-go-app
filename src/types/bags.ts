// ─── Duffel available services (baggage) ─────────────────────────────

export type BagType = 'checked' | 'carry_on';

/** One bag option returned by /api/flights/bags, already mapped to a passenger index. */
export interface NormalizedBagOption {
    serviceId: string;
    bagType: BagType;
    price: number;
    currency: string;
    weightKg: number | null;
    maxQuantity: number;
    /** Index into the passengers[] array in the booking form */
    passengerIndex: number;
    /** Whether this service applies to all segments (vs a specific leg) */
    appliesToAllSegments: boolean;
}

/** A bag the user has chosen to add */
export interface SelectedBag {
    serviceId: string;
    passengerIndex: number;
    bagType: BagType;
    price: number;
    currency: string;
}
