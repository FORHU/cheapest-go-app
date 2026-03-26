/** Classified policy type derived from provider response */
export type BookingPolicyType =
    | 'free_cancellation'
    | 'non_refundable'
    | 'partial_refund'
    | 'tiered';

/** A single cancellation tier (deadline → penalty) */
export interface PolicyTier {
    id: string;
    cancelDeadline: string;          // ISO 8601
    penaltyAmount: number;
    penaltyType: 'fixed' | 'percent' | 'nights';
    currency: string;
    tierOrder: number;
}

/** Immutable snapshot captured at booking time */
export interface BookingPolicySnapshot {
    id: string;
    bookingId: string;
    policyType: BookingPolicyType;
    summary: string | null;
    refundableTag: string | null;
    hotelRemarks: string[];
    noShowPenalty: number;
    earlyDepartureFee: number;
    freeCancelDeadline: string | null; // ISO 8601
    tiers: PolicyTier[];
    rawProviderResponse: Record<string, unknown>;
    capturedAt: string;
}

/** Refund status enum */
export type RefundStatus =
    | 'pending'
    | 'approved'
    | 'processed'
    | 'rejected'
    | 'failed';

/** Refund type enum */
export type RefundType =
    | 'full_refund'
    | 'partial_refund'
    | 'no_show_charge'
    | 'early_departure_charge'
    | 'policy_override';

/** A single refund log entry */
export interface RefundLog {
    id: string;
    bookingId: string;
    refundType: RefundType;
    requestedAmount: number;
    approvedAmount: number | null;
    penaltyAmount: number;
    currency: string;
    status: RefundStatus;
    statusReason: string | null;
    externalRef: string | null;
    requestedAt: string;
    processedAt: string | null;
}

/** Booking with embedded policy (for frontend display) */
export interface BookingWithPolicy {
    bookingId: string;
    policyType: BookingPolicyType;
    policy: BookingPolicySnapshot | null;
    refunds: RefundLog[];

    /** Derived helpers */
    isCancellable: boolean;
    isFreeCancellation: boolean;
    cancellationFee: number | null;
    nextDeadline: string | null;
}
