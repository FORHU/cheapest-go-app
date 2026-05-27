import { SupabaseClient } from '@supabase/supabase-js';
import { CancellationResult } from '@/lib/server/cancellation-engine';

// ============================================================================
// Types
// ============================================================================

export interface RefundRequestResult {
    success: boolean;
    refundLogId?: string;
    error?: string;
}

export interface ProcessRefundResult {
    success: boolean;
    gatewayTransactionId?: string;
    error?: string;
}

/** Refund/cancellation metadata passed through to the refund log */
export interface LiteApiRefundInfo {
    cancellationId?: string;
    refund?: {
        amount?: number;
        currency?: string;
        status?: string;
    };
    stripeRefundId?: string;
}

// ============================================================================
// 1. Create Refund Request
// ============================================================================

/**
 * Creates a refund log entry in 'pending' status.
 * Should be called immediately after a refundable cancellation is confirmed.
 */
export async function createRefundRequest(
    supabase: SupabaseClient,
    bookingId: string,
    calculation: CancellationResult,
    userId?: string
): Promise<RefundRequestResult> {
    if (!calculation.refundable || calculation.refundAmount <= 0) {
        return { success: false, error: 'Booking is not refundable or amount is zero' };
    }

    try {
        const { data, error } = await supabase
            .from('refund_logs')
            .insert({
                booking_id: bookingId,
                user_id: userId ?? null,
                refund_type: calculation.refundType,
                requested_amount: calculation.refundAmount,
                penalty_amount: calculation.penaltyAmount,
                currency: calculation.currency,
                status: 'pending',
                status_reason: calculation.message,
                requested_at: new Date().toISOString(),
            })
            .select('id')
            .single();

        if (error) {
            console.error('[createRefundRequest] DB Error:', error);
            return { success: false, error: 'Failed to create refund log' };
        }

        return { success: true, refundLogId: data.id };
    } catch (err) {
        console.error('[createRefundRequest] Unexpected Error:', err);
        return { success: false, error: 'Unexpected error creating refund request' };
    }
}

// ============================================================================
// 2. Process Refund
// ============================================================================

/**
 * Marks a pending refund as processed. Stripe issues the actual refund;
 * this just records the outcome in refund_logs.
 */
export async function processRefund(
    supabase: SupabaseClient,
    refundLogId: string,
    liteApiInfo: LiteApiRefundInfo
): Promise<ProcessRefundResult> {
    // 1. Fetch Refund Log
    const { data: log, error: logError } = await supabase
        .from('refund_logs')
        .select('*, bookings(booking_id, total_price)')
        .eq('id', refundLogId)
        .single();

    if (logError || !log) {
        return { success: false, error: 'Refund log not found' };
    }

    if (log.status !== 'pending') {
        return { success: false, error: `Refund is already ${log.status}` };
    }

    // 2. Stripe already issued the refund in cancelBooking. Record the outcome here.
    const now = new Date().toISOString();
    const externalRef = liteApiInfo.cancellationId ?? null;

    // Mark refund log as processed
    const { error: updateError } = await supabase
        .from('refund_logs')
        .update({
            status: 'processed',
            approved_amount: log.requested_amount,
            external_ref: externalRef,
            processed_at: now,
        })
        .eq('id', refundLogId);

    if (updateError) {
        console.error('[processRefund] Failed to update refund log:', updateError);
        // Non-fatal — Stripe already issued the refund; DB failure doesn't undo it
    }

    // Update Booking status
    await supabase
        .from('bookings')
        .update({
            status: 'cancelled_refunded',
            updated_at: now,
        })
        .eq('booking_id', log.booking_id);

    return {
        success: true,
        gatewayTransactionId: externalRef ?? undefined,
    };
}
