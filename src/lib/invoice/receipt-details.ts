/**
 * The facts a **Receipt** states beyond the total, derived once for both renderers.
 *
 * The web page and the PDF are separate components that have already drifted apart
 * once — different footers, one naming a legal entity and one not — so the reasoning
 * lives here and each of them only renders the result. See ADR-0042.
 *
 * Everything here is deliberately non-personal. The page's credential is the booking
 * UUID in a forwardable URL, which ADR-0027 already records as thin for flights, so
 * nothing added here should help a stranger act on someone's reservation.
 */

/** What a traveller can be told about getting their money back, and nothing more. */
export type ReceiptCancellation =
    | { kind: 'free'; until: string | null }
    | { kind: 'non_refundable' }
    | { kind: 'partial' }
    | { kind: 'tiered' }
    | { kind: 'refundable' };

export interface ReceiptDiscount {
    amount: number;
    code: string | null;
}

/**
 * The first moment the supplier's schedule stops being free, when the booking records
 * one. Returned as an ISO string for the caller to format in its own locale.
 *
 * Only read for a policy already known to be free-cancellation. A tiered schedule has
 * several deadlines and the earliest of them is not "the" deadline — collapsing tiers
 * into a single free-cancellation date is the bug ADR-0023 was written about.
 */
function freeUntil(cancellationPolicy: unknown): string | null {
    const infos = (cancellationPolicy as { cancelPolicyInfos?: unknown })?.cancelPolicyInfos;
    if (!Array.isArray(infos) || infos.length !== 1) return null;
    const cancelTime = (infos[0] as { cancelTime?: unknown })?.cancelTime;
    if (typeof cancelTime !== 'string' || !cancelTime) return null;
    return Number.isNaN(new Date(cancelTime).getTime()) ? null : cancelTime;
}

/**
 * Null means the booking does not record its terms, and the receipt then says nothing
 * about them. Absent is not the same as non-refundable: claiming a ticket cannot be
 * refunded when we simply do not know is the expensive way to be wrong.
 */
export function receiptCancellation(booking: any, isHotel: boolean): ReceiptCancellation | null {
    if (isHotel) {
        switch (booking?.policy_type) {
            case 'free_cancellation':
                return { kind: 'free', until: freeUntil(booking?.cancellation_policy) };
            case 'non_refundable':
                return { kind: 'non_refundable' };
            case 'partial_refund':
                return { kind: 'partial' };
            case 'tiered':
                return { kind: 'tiered' };
            default:
                return null;
        }
    }

    // Flights carry the airline's rules as recorded at booking. `undefined` is a third
    // state distinct from false, and it stays silent.
    const isRefundable = booking?.fare_policy?.isRefundable;
    if (typeof isRefundable !== 'boolean') return null;
    return isRefundable ? { kind: 'refundable' } : { kind: 'non_refundable' };
}

export interface FareBreakdown {
    /** The fare before tax, as the airline quoted it. */
    fare: number;
    /** Everything else in the charge: the airline's tax, plus any platform fee. */
    taxesAndFees: number;
}

/**
 * Splits the charged total into the airline's fare and everything else.
 *
 * Derived as `total − fare` rather than by reading the supplier's tax directly, so the
 * two rows always account for the whole charge. Reading tax straight from the offer
 * would print a fare and a tax that do not add up to the total whenever a platform fee
 * sits between them, and a receipt whose rows do not reconcile is worse than one that
 * states a single figure.
 *
 * The second row is therefore never "Tax". It holds tax *and* fee, so labelling it as
 * tax would invite a finance team to reclaim against a number that is not all tax —
 * the mislabelling ADR-0042 exists to prevent.
 *
 * Null whenever the split cannot be stood behind: no recorded fare, a fare that is not
 * a usable number, one that is not strictly inside the total, or a currency that does
 * not match what is being charged.
 */
export function fareBreakdown(
    total: number,
    fare: number | null | undefined,
    fareCurrency: string | null | undefined,
    chargeCurrency: string,
): FareBreakdown | null {
    if (fare == null || !Number.isFinite(fare) || !Number.isFinite(total)) return null;
    // A fare equal to the total leaves nothing to itemise; one above it, or at or below
    // zero, means the recorded figures disagree and neither should be printed.
    if (fare <= 0 || fare >= total) return null;
    if (!fareCurrency || fareCurrency.toUpperCase() !== chargeCurrency.toUpperCase()) return null;

    return { fare, taxesAndFees: total - fare };
}

/**
 * A voucher the traveller actually used. Stored on hotel bookings only, and shown
 * because a discount they were given is theirs to see on the document that proves
 * what they paid.
 */
export function receiptDiscount(booking: any): ReceiptDiscount | null {
    const amount = Number(booking?.discount_amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    const code = typeof booking?.voucher_code === 'string' && booking.voucher_code ? booking.voucher_code : null;
    return { amount, code };
}
