import { NormalizedFarePolicy } from './types.ts';

/**
 * Normalizes Duffel fare conditions into our internal format.
 * Duffel provides 'refund_before_departure' and 'change_before_departure'.
 */
export function normalizeDuffelPolicy(offer: any): Omit<NormalizedFarePolicy, 'policyVersion' | 'policySource'> {
    const conditions = offer?.conditions;

    // Default to false unless explicitly allowed
    const isRefundable = !!conditions?.refund_before_departure?.allowed;
    const isChangeable = !!conditions?.change_before_departure?.allowed;

    // Penalty amounts (if allowed, penalty might still be null/undefined meaning 'may apply')
    const refundPenaltyAmount = isRefundable
        ? (conditions.refund_before_departure.penalty_amount ? parseFloat(conditions.refund_before_departure.penalty_amount) : null)
        : undefined;

    const refundPenaltyCurrency = isRefundable ? conditions.refund_before_departure?.penalty_currency : undefined;

    const changePenaltyAmount = isChangeable
        ? (conditions.change_before_departure.penalty_amount ? parseFloat(conditions.change_before_departure.penalty_amount) : null)
        : undefined;

    const changePenaltyCurrency = isChangeable ? conditions.change_before_departure?.penalty_currency : undefined;

    return {
        isRefundable,
        isChangeable,
        refundPenaltyAmount,
        refundPenaltyCurrency,
        changePenaltyAmount,
        changePenaltyCurrency,
        rawSupplierPolicy: conditions
    };
}

/**
 * Normalizes Mystifly V1 fare rules into our internal format.
 * Mystifly V1 sandbox often omits IsRefundable entirely, which MUST default to FALSE.
 */
export function normalizeMystiflyV1Policy(itinerary: any): Omit<NormalizedFarePolicy, 'policyVersion' | 'policySource'> {
    // If field is missing => default to FALSE (conservative — never assume refundable)
    const isRefundable = itinerary?.IsRefundable === true;

    // Change rules aren't universally provided in V1 top-level flat fields, default to false
    const isChangeable = false;

    // Mystifly rarely provides exact penalty amounts before cancellation in V1
    const refundPenaltyAmount = isRefundable ? null : undefined;

    return {
        isRefundable,
        isChangeable,
        refundPenaltyAmount,
        rawSupplierPolicy: itinerary?.PenaltiesInfo || itinerary // Store whatever hints we can
    };
}

/**
 * Normalizes Mystifly V2 branded fare rules into our internal format.
 * Note: Implementation depends on exact V2 response structure; defaulting conservatively.
 */
export function normalizeMystiflyV2Policy(fare: any): Omit<NormalizedFarePolicy, 'policyVersion' | 'policySource'> {
    // Check branded fare attributes if available
    const isRefundable = fare?.IsRefundable === true;
    const isChangeable = fare?.IsExchangeable === true;

    return {
        isRefundable,
        isChangeable,
        refundPenaltyAmount: isRefundable ? null : undefined,
        changePenaltyAmount: isChangeable ? null : undefined,
        rawSupplierPolicy: fare?.Penalties || fare
    };
}
