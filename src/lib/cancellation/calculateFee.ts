import type { CancellationPolicy } from '@/lib/server/bookings';

export interface CancellationFeeResult {
    fee: number;
    refund: number;
    currency: string;
}

/**
 * Calculate the current cancellation fee based on cancellation policies.
 *
 * Algorithm:
 * 1. Sort policies by cancelTime ascending
 * 2. Find the first future deadline — that entry's amount is the current fee
 * 3. If past all deadlines — full charge (totalPrice)
 * 4. Special case: RFN bookings where API omits the amount=0 "free period" entry
 *    → if before first deadline and no explicit free entry, fee = 0
 */
export function calculateCancellationFee(
    cancellationPolicies: CancellationPolicy | undefined | null,
    totalPrice: number,
    currency: string,
): CancellationFeeResult | null {
    const policies = cancellationPolicies?.cancelPolicyInfos;
    if (!policies || policies.length === 0) return null;

    const now = new Date();
    const rfn = cancellationPolicies?.refundableTag === 'RFN';

    const sortedPolicies = [...policies].sort(
        (a, b) => new Date(a.cancelTime).getTime() - new Date(b.cancelTime).getTime()
    );

    // Find the current applicable fee
    let applicableFee = totalPrice; // default: past all deadlines
    for (const policy of sortedPolicies) {
        if (now < new Date(policy.cancelTime)) {
            applicableFee = policy.type === 'PERCENT'
                ? (totalPrice * policy.amount) / 100
                : policy.amount;
            break;
        }
    }

    // Handle RFN bookings where the API omits the amount=0 "free period" entry
    const hasExplicitFreeEntry = sortedPolicies.some(p => p.amount === 0);
    if (rfn && !hasExplicitFreeEntry && applicableFee > 0) {
        const firstDeadline = new Date(sortedPolicies[0].cancelTime);
        if (now < firstDeadline) {
            applicableFee = 0;
        }
    }

    return {
        fee: applicableFee,
        refund: totalPrice - applicableFee,
        currency,
    };
}

/**
 * Check if the booking is currently in a free cancellation window.
 * Uses actual fee calculation (more accurate than refundableTag alone).
 */
export function isCurrentlyFreeCancellation(
    cancellationPolicies: CancellationPolicy | undefined | null,
    totalPrice: number,
    currency: string,
): boolean {
    const result = calculateCancellationFee(cancellationPolicies, totalPrice, currency);
    if (result) {
        return result.fee === 0;
    }
    // Fallback to refundableTag
    return cancellationPolicies?.refundableTag === 'RFN';
}
