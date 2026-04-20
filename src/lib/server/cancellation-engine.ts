import { SupabaseClient } from '@supabase/supabase-js';
import { BookingPolicySnapshot, PolicyTier } from '@/types/booking-policy';

// ============================================================================
// Types
// ============================================================================

export interface CancellationResult {
    isCancellable: boolean;
    refundable: boolean;
    refundAmount: number;
    penaltyAmount: number;
    currency: string;
    refundType: 'full_refund' | 'partial_refund' | 'no_refund';
    message: string;
    appliedTier: PolicyTier | null;
    policyUsed: 'standard' | 'non_refundable' | 'free_cancellation';
    debug?: {
        now: string;
        checkIn: string;
        tiersChecked: number;
    };
}

interface PolicyData {
    booking: {
        total_price: number;
        currency: string;
        check_in: string;
        check_out: string;
        status: string;
        policy_snapshot_id: string | null;
        policy_type: string | null;
    };
    snapshot: BookingPolicySnapshot | null;
    tiers: PolicyTier[];
}

// ============================================================================
// Database Queries
// ============================================================================

/**
 * Fetch booking policy data (snapshot + tiers) from DB
 */
async function fetchPolicyData(
    supabase: SupabaseClient,
    bookingId: string
): Promise<PolicyData | null> {
    // 1. Get booking details + snapshot ID
    const { data: booking, error: bookingError } = await supabase
        .from('bookings')
        .select(`
      total_price,
      currency,
      check_in,
      check_out,
      status,
      policy_snapshot_id,
      policy_type
    `)
        .eq('booking_id', bookingId)
        .single();

    if (bookingError || !booking) {
        console.error('[CancellationEngine] Booking not found:', bookingId);
        return null;
    }

    // 2. If no snapshot, return booking only (will fallback to non-refundable)
    if (!booking.policy_snapshot_id) {
        return {
            booking: booking as PolicyData['booking'],
            snapshot: null,
            tiers: [],
        };
    }

    // 3. Get snapshot
    const { data: snapshot, error: snapshotError } = await supabase
        .from('booking_policy_snapshots')
        .select('*')
        .eq('id', booking.policy_snapshot_id)
        .single();

    if (snapshotError || !snapshot) {
        console.error('[CancellationEngine] Snapshot not found:', booking.policy_snapshot_id);
        return {
            booking: booking as PolicyData['booking'],
            snapshot: null,
            tiers: [],
        };
    }

    // 4. Get tiers
    const { data: tiers, error: tiersError } = await supabase
        .from('policy_tiers')
        .select('*')
        .eq('snapshot_id', snapshot.id)
        .order('tier_order', { ascending: true }); // Earliest first

    return {
        booking: booking as PolicyData['booking'],
        snapshot: mapSnapshot(snapshot),
        tiers: mapTiers(tiers || []),
    };
}

// ============================================================================
// Mappers (DB snake_case -> TS camelCase)
// ============================================================================

function mapSnapshot(row: any): BookingPolicySnapshot {
    return {
        id: row.id,
        bookingId: row.booking_id,
        policyType: row.policy_type,
        summary: row.summary,
        refundableTag: row.refundable_tag,
        hotelRemarks: row.hotel_remarks ?? [],
        noShowPenalty: Number(row.no_show_penalty),
        earlyDepartureFee: Number(row.early_departure_fee),
        freeCancelDeadline: row.free_cancel_deadline,
        rawLiteapiResponse: row.raw_liteapi_response,
        capturedAt: row.captured_at,
        tiers: [], // filled separately
    };
}

function mapTiers(rows: any[]): PolicyTier[] {
    return rows.map((r) => ({
        id: r.id,
        cancelDeadline: r.cancel_deadline,
        penaltyAmount: Number(r.penalty_amount),
        penaltyType: r.penalty_type, // 'fixed' | 'percent' | 'nights'
        currency: r.currency,
        tierOrder: r.tier_order,
    }));
}

// ============================================================================
// Core Calculation Logic
// ============================================================================

/**
 * Calculates cancellation penalty based on policy snapshot and current time.
 * Handles:
 *  - Free cancellation (before any deadline)
 *  - Non-refundable (100% penalty)
 *  - Tiered penalties (checks sorted deadlines)
 *  - Percent / Fixed / Nights calculations
 */
export async function calculateCancellation(
    supabase: SupabaseClient,
    bookingId: string,
    nowDate: Date = new Date() // Allow mocking time for testing
): Promise<CancellationResult> {
    const data = await fetchPolicyData(supabase, bookingId);

    // Default fallback if no policy snapshot found — use booking.policy_type as secondary signal
    if (!data || !data.snapshot) {
        const policyType = data?.booking.policy_type;
        const totalPrice = Number(data?.booking.total_price ?? 0);
        const currency = data?.booking.currency || 'PHP';

        if (policyType === 'free_cancellation') {
            return {
                isCancellable: true,
                refundable: true,
                refundAmount: totalPrice,
                penaltyAmount: 0,
                currency,
                refundType: 'full_refund',
                message: 'Free cancellation applies.',
                appliedTier: null,
                policyUsed: 'free_cancellation',
            };
        }

        if (policyType === 'non_refundable') {
            return {
                isCancellable: true,
                refundable: false,
                refundAmount: 0,
                penaltyAmount: totalPrice,
                currency,
                refundType: 'no_refund',
                message: 'This booking is non-refundable.',
                appliedTier: null,
                policyUsed: 'non_refundable',
            };
        }

        return {
            isCancellable: false,
            refundable: false,
            refundAmount: 0,
            penaltyAmount: 0,
            currency,
            refundType: 'no_refund',
            message: 'No active policy found. Cancellation checks require manual review.',
            appliedTier: null,
            policyUsed: 'standard',
        };
    }

    const { booking, snapshot, tiers } = data;
    const totalPrice = Number(booking.total_price);
    const currency = booking.currency;

    // 1. Non-refundable policy (check both policyType and refundableTag for safety)
    const isNRFN =
        snapshot.policyType === 'non_refundable' ||
        snapshot.refundableTag === 'NRFN' ||
        snapshot.refundableTag === 'NON_REFUNDABLE' ||
        snapshot.refundableTag === 'NON-REFUNDABLE';

    if (isNRFN) {
        return {
            isCancellable: true,
            refundable: false,
            refundAmount: 0,
            penaltyAmount: totalPrice,
            currency,
            refundType: 'no_refund',
            message: 'This booking is non-refundable.',
            appliedTier: null,
            policyUsed: 'non_refundable',
        };
    }

    // 2. Free cancellation check (if explicit deadline exists)
    if (snapshot.policyType === 'free_cancellation') {
        const deadline = snapshot.freeCancelDeadline ? new Date(snapshot.freeCancelDeadline) : null;
        const isBeforeDeadline = deadline ? nowDate < deadline : true; // If no deadline, assume always free? No, usually deadline exists.

        if (isBeforeDeadline) {
            return {
                isCancellable: true,
                refundable: true,
                refundAmount: totalPrice,
                penaltyAmount: 0,
                currency,
                refundType: 'full_refund',
                message: 'Free cancellation applies.',
                appliedTier: null,
                policyUsed: 'free_cancellation',
            };
        }
    }

    // 3. Tiered / Partial Refund Calculation
    // Sort tiers by deadline ascending (earliest first)
    const sortedTiers = [...tiers].sort(
        (a, b) => new Date(a.cancelDeadline).getTime() - new Date(b.cancelDeadline).getTime()
    );

    let appliedTier: PolicyTier | null = null;

    // Find the stricter penalty that applies (latest passed deadline)
    // Logic:
    // - If NOW > deadline1, tier1 penalty applies.
    // - If NOW > deadline2 (later), tier2 penalty applies (usually stricter).
    // - Iterate through all tiers, keep the last one that `nowDate` has passed.

    for (const tier of sortedTiers) {
        if (nowDate >= new Date(tier.cancelDeadline)) {
            appliedTier = tier;
        }
    }

    // If no deadline passed yet => Free cancellation
    if (!appliedTier) {
        return {
            isCancellable: true,
            refundable: true,
            refundAmount: totalPrice,
            penaltyAmount: 0,
            currency,
            refundType: 'full_refund',
            message: 'Free cancellation (before deadline).',
            appliedTier: null,
            policyUsed: 'standard',
            debug: { now: nowDate.toISOString(), checkIn: booking.check_in, tiersChecked: tiers.length },
        };
    }

    // Calculate penalty from the applied tier
    let penalty = 0;
    const pType = appliedTier.penaltyType;
    const pAmount = appliedTier.penaltyAmount;

    if (pType === 'percent') {
        // e.g. 50% => 0.5 * total
        penalty = (pAmount / 100) * totalPrice;
    } else if (pType === 'nights') {
        // Nights calculation
        const checkIn = new Date(booking.check_in);
        const checkOut = new Date(booking.check_out);
        const oneDay = 24 * 60 * 60 * 1000;
        const totalNights = Math.round(Math.abs((checkOut.getTime() - checkIn.getTime()) / oneDay)) || 1;
        const nightlyRate = totalPrice / totalNights;
        penalty = pAmount * nightlyRate;
    } else {
        // Fixed amount
        penalty = pAmount;
    }

    // Cap penalty at total price (never negative refund)
    if (penalty > totalPrice) penalty = totalPrice;

    const refundAmount = Math.max(0, totalPrice - penalty);

    let refundType: CancellationResult['refundType'] = 'partial_refund';
    if (refundAmount === totalPrice) refundType = 'full_refund';
    if (refundAmount === 0) refundType = 'no_refund';

    return {
        isCancellable: true, // Assuming physically cancellable even with penalty
        refundable: refundAmount > 0,
        refundAmount,
        penaltyAmount: penalty,
        currency,
        refundType,
        message: `Cancellation fee: ${penalty.toFixed(2)} ${currency}. Refund: ${refundAmount.toFixed(2)} ${currency}.`,
        appliedTier,
        policyUsed: 'standard',
        debug: { now: nowDate.toISOString(), checkIn: booking.check_in, tiersChecked: tiers.length },
    };
}
