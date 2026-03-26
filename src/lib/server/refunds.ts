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

/** Shape of the refund/cancellation info returned by the provider */
export interface ProviderRefundInfo {
    cancellationId?: string;
    refund?: {
        amount?: number;
        currency?: string;
        status?: string;
    };
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
// 2. Process Refund (ONDA handles payment refund automatically)
// ============================================================================

/**
 * Marks a pending refund as processed using ONDA's cancel response.
 *
 * ONDA's cancel endpoint both cancels the booking AND processes the refund.
 * There is no separate "refund API" to call.
 * This function simply records that fact in our `refund_logs` table.
 *
 * @param supabase  – authenticated Supabase client
 * @param refundLogId – the pending refund_logs row ID
 * @param providerInfo – cancellation/refund data from ONDA's response
 */
export async function processRefund(
    supabase: SupabaseClient,
    refundLogId: string,
    providerInfo: ProviderRefundInfo
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

    // 2. ONDA already processed the refund when we called the cancel endpoint.
    //    We just record the outcome.
    const now = new Date().toISOString();
    const externalRef = providerInfo.cancellationId ?? null;

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
        // Fall through — ONDA already refunded, so we treat DB failure as non-fatal
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
