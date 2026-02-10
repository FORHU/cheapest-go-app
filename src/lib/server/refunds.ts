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
    calculation: CancellationResult
): Promise<RefundRequestResult> {
    if (!calculation.refundable || calculation.refundAmount <= 0) {
        return { success: false, error: 'Booking is not refundable or amount is zero' };
    }

    try {
        const { data, error } = await supabase
            .from('refund_logs')
            .insert({
                booking_id: bookingId,
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
// 2. Process Refund (Mock Payment Gateway)
// ============================================================================

/**
 * Mocks the interaction with a payment gateway (e.g., Stripe, Xendit).
 * In production, this would make an API call using the original transaction ID.
 */
async function mockGatewayRefund(amount: number, currency: string): Promise<ProcessRefundResult> {
    // Simulate API latency
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Simulate success (90% chance)
    if (Math.random() > 0.1) {
        return {
            success: true,
            gatewayTransactionId: `ref_${Math.random().toString(36).substring(7)}`,
        };
    }

    // Simulate random failure
    return { success: false, error: 'Gateway declined refund (simulation)' };
}

/**
 * Processes a pending refund log:
 * 1. Calls Payment Gateway
 * 2. Updates refund_logs status (processed/failed)
 * 3. Updates bookings status (cancelled_refunded / cancelled_refund_failed)
 */
export async function processRefund(
    supabase: SupabaseClient,
    refundLogId: string
): Promise<ProcessRefundResult> {
    // 1. Fetch Refund Log + Booking
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

    // 2. Call Gateway
    const gatewayResult = await mockGatewayRefund(log.requested_amount, log.currency);

    // 3. Handle Result
    const now = new Date().toISOString();

    if (gatewayResult.success) {
        // A. Success: Update Log + Booking
        const { error: updateError } = await supabase
            .from('refund_logs')
            .update({
                status: 'processed',
                approved_amount: log.requested_amount,
                external_ref: gatewayResult.gatewayTransactionId,
                processed_at: now,
            })
            .eq('id', refundLogId);

        if (updateError) console.error('Failed to update refund log status (success case)', updateError);

        // Update Booking status
        await supabase
            .from('bookings')
            .update({ status: 'cancelled_refunded' })
            .eq('booking_id', log.booking_id);

        return gatewayResult;

    } else {
        // B. Failure: Update Log + Booking
        const { error: updateError } = await supabase
            .from('refund_logs')
            .update({
                status: 'failed',
                status_reason: gatewayResult.error,
                processed_at: now,
            })
            .eq('id', refundLogId);

        if (updateError) console.error('Failed to update refund log status (failure case)', updateError);

        // Update Booking status
        await supabase
            .from('bookings')
            .update({ status: 'cancelled_refund_failed' })
            .eq('booking_id', log.booking_id);

        return gatewayResult;
    }
}
