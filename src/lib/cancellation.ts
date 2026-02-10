

/**
 * Simplified client-side cancellation fee calculator.
 * Used for immediate feedback in the UI.
 * The server-side engine (cancellation-engine.ts) is the source of truth.
 */

export interface CancellationPolicyInfo {
    amount: number;
    currency?: string;
    type?: 'fixed' | 'percent' | 'nights';
    cancelTime?: string; // ISO date
    deadline?: string;   // ISO date (alias)
}

export interface MinimalPolicy {
    refundableTag?: string;
    cancelPolicyInfos?: CancellationPolicyInfo[];
    hotelRemarks?: string[];
}

export interface CancellationFeeResult {
    fee: number;
    refund: number;
    currency: string;
    isFreeCancellation: boolean;
}

export function calculateCancellationFee(
    policy: MinimalPolicy | null | undefined,
    totalPrice: number,
    currency: string
): CancellationFeeResult {
    if (!policy) {
        // Default to unknown/non-refundable if no policy
        return {
            fee: totalPrice,
            refund: 0,
            currency,
            isFreeCancellation: false,
        };
    }

    // 1. Check Refundable Tag
    if (policy.refundableTag === 'NON_REFUNDABLE') {
        return {
            fee: totalPrice,
            refund: 0,
            currency,
            isFreeCancellation: false,
        };
    }

    // 2. Check Tiers
    const now = new Date();
    const infos = policy.cancelPolicyInfos || [];

    // If no infos but tag says refundable -> assume free? 
    // Safety: assume full penalty if missing info to avoid over-promising
    if (infos.length === 0) {
        // If tag is explicitly free/refundable, return 0 fee? 
        // LiteAPI usually sends empty infos for free cancellation SOMETIMES.
        // But usually sends a "0 amount" tier.
        // Let's be defensive: if tag is RFN, 0 fee. Else full.
        const isRfn = policy.refundableTag === 'RFN' || policy.refundableTag === 'REFUNDABLE';
        return {
            fee: isRfn ? 0 : totalPrice,
            refund: isRfn ? totalPrice : 0,
            currency,
            isFreeCancellation: isRfn,
        };
    }

    // Sort tiers by date (earliest first)
    const sortedInfos = [...infos].sort((a, b) => {
        const da = new Date(a.cancelTime || a.deadline || '');
        const db = new Date(b.cancelTime || b.deadline || '');
        return da.getTime() - db.getTime();
    });

    // Find applicable tier
    let appliedFee = 0;
    let isFree = true;

    for (const info of sortedInfos) {
        const deadline = new Date(info.cancelTime || info.deadline || '');
        const amount = Number(info.amount) || 0;

        // If we passed the deadline, this fee applies
        if (now >= deadline) {
            if (info.type === 'percent') {
                appliedFee = (amount / 100) * totalPrice;
            } else if (info.type === 'nights') {
                // Simple estimate: 1 night
                // We lack check-in/out here often, so fall back to conservative est.
                // Or if caller provided nightly rate? No.
                // Assume 1 night for now or 100% if unknown.
                // Let's just treat amount as fixed if unknown.
                appliedFee = amount; // Fallback
            } else {
                // Fixed
                appliedFee = amount;
            }
            isFree = false;
        }
    }

    // Cap
    if (appliedFee > totalPrice) appliedFee = totalPrice;

    return {
        fee: appliedFee,
        refund: Math.max(0, totalPrice - appliedFee),
        currency,
        isFreeCancellation: isFree && appliedFee === 0,
    };
}
