import { BookingPolicyType, PolicyTier } from '@/types/booking-policy';
import { formatCurrency, formatDate } from './utils';

// ============================================================================
// UI Mapping Helpers
// ============================================================================

export function getPolicyTitle(type: BookingPolicyType): string {
    switch (type) {
        case 'free_cancellation':
            return 'Free Cancellation';
        case 'non_refundable':
            return 'Non-Refundable';
        case 'partial_refund':
            return 'Partial Refund Available';
        case 'tiered':
            return 'Conditional Cancellation';
        default:
            return 'Cancellation Policy';
    }
}

export function getPolicyBadgeColor(type: BookingPolicyType): string {
    switch (type) {
        case 'free_cancellation':
            return 'bg-emerald-500 text-white';
        case 'non_refundable':
            return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
        case 'partial_refund':
        case 'tiered':
            return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
        default:
            return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300';
    }
}

// ============================================================================
// Formatter Functions
// ============================================================================

export function formatDeadline(dateStr: string): string {
    if (!dateStr) return '';
    try {
        return formatDate(dateStr, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: 'numeric',
        });
    } catch (e) {
        return dateStr;
    }
}

export function formatTierRow(tier: PolicyTier, currency: string): string {
    const date = formatDeadline(tier.cancelDeadline);

    let penaltyText = '';
    if (tier.penaltyType === 'percent') {
        penaltyText = `${tier.penaltyAmount}% penalty`;
    } else if (tier.penaltyType === 'nights') {
        penaltyText = `${tier.penaltyAmount} night(s) penalty`;
    } else {
        // Fixed amount
        penaltyText = `${formatCurrency(tier.penaltyAmount, currency)} penalty`;
    }

    // Logic: "From [Date]: [Penalty]"
    // Or "Cancel after [Date]: [Penalty]"?
    // Usually tiers mean "If you cancel starting from this time..."
    return `After ${date}: ${penaltyText}`;
}

export function formatPolicyDescription(
    type: BookingPolicyType,
    freeDeadline: string | null
): string {
    if (type === 'non_refundable') {
        return 'This booking is non-refundable. You will be charged the full amount if you cancel.';
    }

    if (type === 'free_cancellation' && freeDeadline) {
        return `You can cancel for free until ${formatDeadline(freeDeadline)}. After this date, cancellation fees will apply.`;
    }

    if (type === 'free_cancellation') {
        return 'You can cancel for free.';
    }

    if (type === 'partial_refund') {
        return 'The free cancellation period has passed. A cancellation fee applies — see the breakdown below.';
    }

    if (type === 'tiered') {
        return 'Cancellation fees increase as the check-in date approaches. See the timeline below.';
    }

    return 'Cancellation fees apply based on the timeline below.';
}

/**
 * Generates a complete list of UI-ready statements from policy data.
 */
export function generatePolicyNuances(
    type: BookingPolicyType,
    tiers: PolicyTier[],
    currency: string,
    noShowPenalty: number,
    earlyDepartureFee: number
): string[] {
    const lines: string[] = [];

    // 1. Tiers
    if (type === 'non_refundable') {
        lines.push('Non-refundable: 100% penalty applies immediately.');
    } else {
        // Sort tiers just in case
        const sorted = [...tiers].sort(
            (a, b) => new Date(a.cancelDeadline).getTime() - new Date(b.cancelDeadline).getTime()
        );

        if (sorted.length === 0 && type === 'free_cancellation') {
            // already handled by description, but can add explicit line
            lines.push('No cancellation fees.');
        }

        sorted.forEach((tier) => {
            lines.push(formatTierRow(tier, currency));
        });
    }

    // 2. No-Show
    if (noShowPenalty > 0) {
        lines.push(`No-show penalty: ${formatCurrency(noShowPenalty, currency)}`);
    }

    // 3. Early Departure
    if (earlyDepartureFee > 0) {
        lines.push(`Early departure fee: ${formatCurrency(earlyDepartureFee, currency)}`);
    }

    return lines;
}

// ============================================================================
// Bridge: Raw LiteAPI Data → BookingPolicyType
// ============================================================================

interface RawCancelPolicyInfo {
    cancelTime: string;
    amount: number;
    currency: string;
    type: string;
}

/**
 * Derives a BookingPolicyType from raw LiteAPI cancellation data.
 * Use this when you only have the LiteAPI response (not a BookingPolicySnapshot).
 *
 * KEY: refundableTag defines how to interpret tiers:
 *   RFN  → tiers represent after-deadline penalties; before first tier = FREE
 *   NRFN → tiers represent before-deadline fees; after all tiers = FULL PENALTY
 *
 * So an RFN booking with penalty tiers is still "free cancellation" (with a deadline).
 * An NRFN booking with penalty tiers is "partial refund" (some money back before deadline).
 */
export function derivePolicyType(
    refundableTag?: string,
    cancelPolicyInfos?: RawCancelPolicyInfo[]
): BookingPolicyType {
    const isRFN = refundableTag === 'RFN' || refundableTag === 'REFUNDABLE';
    const isNRFN = refundableTag === 'NRFN' || refundableTag === 'NON_REFUNDABLE';

    const policies = cancelPolicyInfos ?? [];

    if (policies.length > 0) {
        const hasFreePeriod = policies.some((p) => p.amount === 0);
        const hasPenalty = policies.some((p) => p.amount > 0);

        // RFN: free cancellation rate — tiers are after-deadline penalties
        if (isRFN) {
            if (hasPenalty) return 'free_cancellation'; // Free until deadline, then penalty
            return 'free_cancellation'; // All tiers are free
        }

        // NRFN: non-refundable rate — tiers are before-deadline fees
        // Even if tiers exist with lesser penalties, NRFN is fundamentally non-refundable.
        // The tiers just define the penalty structure leading up to full penalty.
        if (isNRFN) {
            return 'non_refundable';
        }

        // Unknown tag — use tier data directly
        if (hasFreePeriod && !hasPenalty) return 'free_cancellation';
        if (hasFreePeriod && hasPenalty) return 'tiered';
        if (!hasFreePeriod && hasPenalty) return 'partial_refund';
        return 'free_cancellation';
    }

    // No tier data — fall back to tag
    if (isNRFN) return 'non_refundable';
    if (isRFN) return 'free_cancellation';
    return 'non_refundable';
}

/**
 * Extracts the free cancellation deadline from raw cancelPolicyInfos.
 *
 * For RFN bookings: the deadline is the FIRST tier's cancelTime (penalties start after).
 * For NRFN bookings: the deadline is the first 0-amount tier's cancelTime (if any).
 */
export function getFreeCancelDeadline(
    cancelPolicyInfos?: RawCancelPolicyInfo[],
    refundableTag?: string
): string | null {
    if (!cancelPolicyInfos?.length) return null;

    const sorted = [...cancelPolicyInfos].sort(
        (a, b) => new Date(a.cancelTime).getTime() - new Date(b.cancelTime).getTime()
    );

    // For RFN: free period ends at the first tier deadline
    const isRFN = refundableTag === 'RFN' || refundableTag === 'REFUNDABLE';
    if (isRFN) {
        return sorted[0]?.cancelTime ?? null;
    }

    // For NRFN/unknown: look for explicit 0-amount tier
    const freePolicy = sorted.find((p) => p.amount === 0);
    return freePolicy?.cancelTime ?? null;
}

