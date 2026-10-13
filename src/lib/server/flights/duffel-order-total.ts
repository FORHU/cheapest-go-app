export interface OrderTotal {
    /** Base fare plus selected services, fixed to 2 decimals, as Duffel's `payments.amount` wants it. */
    total: string;
    base: number;
    seatExtra: number;
    bagExtra: number;
}

/**
 * The amount to pay Duffel for an offer plus the selected ancillaries.
 *
 * Service prices come from `available_services` on the offer itself, never from the client's
 * seat/bag totals: Duffel validates `payments.amount` against its own arithmetic and rejects a
 * mismatch, and a client-supplied number could understate what the card is asked for.
 */
export function computeOrderTotal(
    rawOffer: any,
    seatServiceIds: string[] | undefined,
    bagServiceIds: string[] | undefined,
): OrderTotal {
    const base = parseFloat(rawOffer?.total_amount ?? '0') || 0;
    const available: any[] = rawOffer?.available_services ?? [];

    const sumFor = (ids: string[] | undefined) =>
        (ids ?? []).reduce((sum, id) => {
            const svc = available.find(s => s.id === id);
            return svc ? sum + (parseFloat(svc.total_amount ?? '0') || 0) : sum;
        }, 0);

    const seatExtra = sumFor(seatServiceIds);
    const bagExtra = sumFor(bagServiceIds);
    return { total: (base + seatExtra + bagExtra).toFixed(2), base, seatExtra, bagExtra };
}
