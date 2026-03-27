import { createAdminClient } from '@/utils/supabase/admin';
import { stripe } from '@/lib/stripe/server';
import { sendFlightCancellationEmail, sendFlightCancellationRefundEmail } from '@/lib/server/email';
import { createNotification, logAdminAction } from './notify';
import { RecoveryActionResult, MonitoringData } from '@/types/admin';

// ============================================================================
// Booking Recovery Tools
// ============================================================================

type BookingTableName = 'unified_bookings' | 'bookings' | 'flight_bookings';

// Tables that have a metadata JSONB column
const TABLES_WITH_METADATA: BookingTableName[] = ['unified_bookings'];

// Tables that have an updated_at timestamp column
const TABLES_WITH_UPDATED_AT: BookingTableName[] = ['unified_bookings', 'bookings'];

// Tables that support the 'refunded' status directly in the DB
const TABLES_SUPPORTING_REFUNDED: BookingTableName[] = ['unified_bookings', 'bookings'];

/**
 * Helper: find a booking by ID across all three booking tables.
 * Returns the row data and the table it was found in.
 * Always uses select('*') to avoid column mismatch across different table schemas.
 */
async function findBookingAcrossTables(
    supabase: ReturnType<typeof createAdminClient>,
    bookingId: string,
): Promise<{ data: any; table: BookingTableName } | null> {
    // Try each table in order
    const tables: BookingTableName[] = ['unified_bookings', 'bookings', 'flight_bookings'];
    for (const table of tables) {
        const { data, error } = await supabase
            .from(table)
            .select('*')
            .eq('id', bookingId)
            .single();

        if (!error && data) {
            return { data, table };
        }
    }
    return null;
}

/**
 * Fetch full raw booking data for admin inspection.
 * Searches across unified_bookings, bookings, and flight_bookings.
 */
export async function getBookingRawData(bookingId: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
        const supabase = createAdminClient();
        const result = await findBookingAcrossTables(supabase, bookingId);

        if (!result) {
            return { success: false, error: 'Booking not found in any table' };
        }

        // Return the full row from the specific table it was found in.
        // The UI will handle displaying either result.metadata (if present) or the whole row.
        return { success: true, data: result.data };
    } catch (err) {
        console.error('[getBookingRawData] Error:', err);
        return { success: false, error: err instanceof Error ? err.message : 'Unexpected error' };
    }
}

/**
 * Force a ticket status re-check via the Mystifly TripDetails API.
 * Only works for Mystifly flight bookings with a valid PNR.
 */
export async function adminForceStatusRecheck(bookingId: string): Promise<RecoveryActionResult> {
    try {
        const supabase = createAdminClient();

        // 1. Fetch the booking from any table
        const result = await findBookingAcrossTables(supabase, bookingId);

        if (!result) {
            return { success: false, message: 'Booking not found' };
        }

        const { data: booking, table: sourceTable } = result;

        if (booking.provider !== 'mystifly') {
            return { success: false, message: `Status recheck is only supported for Mystifly bookings. This booking uses "${booking.provider}".` };
        }

        const metadata = booking.metadata as Record<string, unknown>;
        const pnr = (metadata?.pnr as string) || booking.external_id || booking.pnr;

        if (!pnr) {
            return { success: false, message: 'No PNR found for this booking. Cannot query Mystifly.' };
        }

        // 2. Create a Mystifly session
        const MYSTIFLY_BASE_URL = process.env.MYSTIFLY_BASE_URL || 'https://restapidemo.myfarebox.com';
        const sessionRes = await fetch(`${MYSTIFLY_BASE_URL}/api/CreateSession`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                UserName: process.env.MYSTIFLY_USERNAME || '',
                Password: process.env.MYSTIFLY_PASSWORD || '',
                AccountNumber: process.env.MYSTIFLY_ACCOUNT_NUMBER || '',
            }),
        });

        if (!sessionRes.ok) {
            return { success: false, message: `Mystifly session creation failed (HTTP ${sessionRes.status})` };
        }

        const sessionData = await sessionRes.json();
        if (!sessionData.Success || !sessionData.Data?.SessionId) {
            return { success: false, message: `Mystifly session failed: ${sessionData.Message || 'Unknown error'}` };
        }

        const sessionId = sessionData.Data.SessionId;

        // 3. Call TripDetails to get current status
        const tripRes = await fetch(`${MYSTIFLY_BASE_URL}/api/v1/TripDetails/Flight`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionId}`,
            },
            body: JSON.stringify({
                UniqueID: pnr,
            }),
        });

        if (!tripRes.ok) {
            const text = await tripRes.text();
            return { success: false, message: `Mystifly TripDetails HTTP error: ${tripRes.status} ${text}` };
        }

        const tripData = await tripRes.json();

        if (!tripData.Success) {
            return {
                success: false,
                message: `Mystifly TripDetails failed: ${tripData.Message || 'Unknown error'}`,
                data: tripData,
            };
        }

        // 4. Extract ticket info from the response
        const tripInfo = tripData.Data || {};
        const ticketNumbers: string[] = [];
        let newStatus = booking.status;

        // Parse passengers for ticket numbers
        const travelers = tripInfo.TravelItinerary?.ItineraryInfo?.ReservationItems ||
            tripInfo.TravelItinerary?.ItineraryInfo?.Passengers || [];

        if (Array.isArray(travelers)) {
            for (const traveler of travelers) {
                const eTicket = traveler.ETicketNumber || traveler.TicketNumber;
                if (eTicket) ticketNumbers.push(eTicket);
            }
        }

        // Determine new status based on ticket presence
        if (ticketNumbers.length > 0) {
            newStatus = 'ticketed';
        } else if (tripInfo.TravelItinerary?.ItineraryInfo?.ItineraryStatus === 'Cancelled') {
            newStatus = 'cancelled';
        }

        // 5. Update the booking in the same table it was found in
        const hasMetadata = TABLES_WITH_METADATA.includes(sourceTable);
        const hasUpdatedAt = TABLES_WITH_UPDATED_AT.includes(sourceTable);

        const updatePayload: Record<string, any> = {
            status: newStatus,
        };

        if (hasUpdatedAt) {
            updatePayload.updated_at = new Date().toISOString();
        }

        if (hasMetadata) {
            updatePayload.metadata = {
                ...(booking.metadata as object || {}),
                lastStatusRecheck: new Date().toISOString(),
                _mystiflyTripDetails: tripInfo,
                ...(ticketNumbers.length > 0 ? { ticketNumbers, tickets: ticketNumbers } : {}),
            };
        }

        await supabase
            .from(sourceTable)
            .update(updatePayload)
            .eq('id', bookingId);

        logAdminAction({
            action: 'force_status_recheck',
            bookingId,
            table: sourceTable,
            previousStatus: booking.status,
            newStatus,
            provider: 'mystifly',
            details: ticketNumbers.length > 0 ? `Tickets: ${ticketNumbers.join(', ')}` : 'No tickets found',
            triggeredBy: 'admin',
        });

        return {
            success: true,
            message: ticketNumbers.length > 0
                ? `Status updated to "${newStatus}". Found ${ticketNumbers.length} ticket(s): ${ticketNumbers.join(', ')}`
                : `Status recheck completed. Current status: "${newStatus}". No tickets found yet.`,
            newStatus,
            data: { ticketNumbers, tripInfo },
        };
    } catch (err) {
        console.error('[adminForceStatusRecheck] Error:', err);
        return { success: false, message: err instanceof Error ? err.message : 'Unexpected error during status recheck' };
    }
}

/**
 * Admin force-cancel a booking. Searches across all booking tables.
 */
export async function adminCancelBooking(bookingId: string): Promise<RecoveryActionResult> {
    try {
        const supabase = createAdminClient();

        const result = await findBookingAcrossTables(supabase, bookingId);

        if (!result) {
            return { success: false, message: 'Booking not found' };
        }

        const { data: booking, table: sourceTable } = result;

        if (booking.status === 'cancelled') {
            return { success: false, message: 'Booking is already cancelled' };
        }

        const now = new Date().toISOString();
        const hasMetadata = TABLES_WITH_METADATA.includes(sourceTable);
        const hasUpdatedAt = TABLES_WITH_UPDATED_AT.includes(sourceTable);

        const updatedMetadata = hasMetadata ? {
            ...(booking.metadata as object || {}),
            cancelledAt: now,
            cancelledBy: 'admin',
            previousStatus: booking.status,
        } : undefined;

        const updatePayload: Record<string, any> = {
            status: 'cancelled',
        };
        if (hasUpdatedAt) updatePayload.updated_at = now;
        if (updatedMetadata) updatePayload.metadata = updatedMetadata;

        const { error: updateError } = await supabase
            .from(sourceTable)
            .update(updatePayload)
            .eq('id', bookingId);

        if (updateError) {
            return { success: false, message: `Failed to update: ${updateError.message}` };
        }

        createNotification(
            'Booking Force-Cancelled',
            `Admin cancelled booking ${bookingId} (was "${booking.status}").`,
            'alert'
        );

        logAdminAction({
            action: 'force_cancel',
            bookingId,
            table: sourceTable,
            previousStatus: booking.status,
            newStatus: 'cancelled',
            triggeredBy: 'admin',
        });

        return {
            success: true,
            message: `Booking cancelled successfully (was "${booking.status}", table: ${sourceTable})`,
            newStatus: 'cancelled',
        };
    } catch (err) {
        console.error('[adminCancelBooking] Error:', err);
        return { success: false, message: err instanceof Error ? err.message : 'Unexpected error' };
    }
}

/**
 * Helper: determines if a booking is refundable based on its policy columns.
 * Handles unified_bookings (metadata), bookings (policy_type), and flight_bookings (fare_policy).
 */
export function checkRefundability(booking: any, table: BookingTableName): { refundable: boolean; reason: string } {
    if (table === 'unified_bookings') {
        const metadata = booking.metadata || {};
        if (booking.type === 'flight') {
            const farePolicy = metadata.farePolicy || metadata.fare_policy;
            const isRefundable = farePolicy?.isRefundable ?? farePolicy?.refundable ?? false;
            return { 
                refundable: !!isRefundable, 
                reason: isRefundable ? 'Refundable flight (Fare Policy)' : 'Non-refundable flight policy' 
            };
        } else if (booking.type === 'hotel') {
            // For unified hotels, liteapi policies are usually in metadata.cancellationPolicy
            const policy = metadata.cancellationPolicy || metadata.cancellation_policy;
            const policyType = policy?.policyType || policy?.policy_type;
            const isRefundable = policyType && policyType !== 'non_refundable';
            return { 
                refundable: !!isRefundable, 
                reason: isRefundable ? `Hotel policy: ${policyType}` : 'Non-refundable hotel policy' 
            };
        }
    } else if (table === 'bookings') {
        const policyType = booking.policy_type;
        const isRefundable = policyType && policyType !== 'non_refundable';
        return { 
            refundable: isRefundable, 
            reason: isRefundable ? `Hotel policy: ${policyType}` : 'Non-refundable hotel (Legacy)' 
        };
    } else if (table === 'flight_bookings') {
        const farePolicy = booking.fare_policy;
        const isRefundable = farePolicy?.isRefundable ?? farePolicy?.refundable ?? false;
        return { 
            refundable: !!isRefundable, 
            reason: isRefundable ? 'Refundable flight (Legacy Fare Policy)' : 'Non-refundable flight (Legacy)' 
        };
    }

    return { refundable: false, reason: 'Unknown or missing policy data' };
}

/**
 * Admin force-refund a booking. Searches across all booking tables.
 * Note: Actual payment refund must be done manually via Stripe/provider dashboard.
 */
export async function adminForceRefund(bookingId: string, reason?: string): Promise<RecoveryActionResult> {
    try {
        const supabase = createAdminClient();

        const result = await findBookingAcrossTables(supabase, bookingId);

        if (!result) {
            return { success: false, message: 'Booking not found' };
        }

        const { data: booking, table: sourceTable } = result;

        if (booking.status === 'refunded') {
            return { success: false, message: 'Booking is already marked as refunded' };
        }

        // 1. Check for refundable policy enforcement
        const policyCheck = checkRefundability(booking, sourceTable);
        if (!policyCheck.refundable) {
            return { 
                success: false, 
                message: `Refund blocked: ${policyCheck.reason}. Refunds can only be applied to bookings with a refundable policy.` 
            };
        }

        const now = new Date().toISOString();
        const hasMetadata = TABLES_WITH_METADATA.includes(sourceTable);
        const hasUpdatedAt = TABLES_WITH_UPDATED_AT.includes(sourceTable);
        const supportsRefunded = TABLES_SUPPORTING_REFUNDED.includes(sourceTable);

        const updatedMetadata = hasMetadata ? {
            ...(booking.metadata as object || {}),
            refundedAt: now,
            refundedBy: 'admin',
            previousStatus: booking.status,
        } : undefined;

        // Use 'refunded' if supported, otherwise stay in 'cancelled' (or move to it)
        // Note: For legacy tables, we can't store 'refunded' so we keep 'cancelled'.
        const targetStatus = supportsRefunded ? 'refunded' : 'cancelled';

        const updatePayload: Record<string, any> = {
            status: targetStatus,
        };
        if (hasUpdatedAt) updatePayload.updated_at = now;
        if (updatedMetadata) updatePayload.metadata = updatedMetadata;

        const { error: updateError } = await supabase
            .from(sourceTable)
            .update(updatePayload)
            .eq('id', bookingId);

        if (updateError) {
            return { success: false, message: `Failed to update: ${updateError.message}` };
        }

        // Create a refund log entry for audit purposes
        const { error: logError } = await supabase
            .from('refund_logs')
            .insert({
                booking_id: sourceTable === 'bookings' ? booking.booking_id : booking.id,
                user_id: booking.user_id,
                refund_type: 'policy_override',
                requested_amount: booking.total_price || booking.totalAmount || 0,
                approved_amount: booking.total_price || booking.totalAmount || 0,
                currency: booking.currency || 'USD',
                status: 'processed',
                status_reason: reason || 'Admin forced refund',
                processed_at: now,
                processed_by: 'admin'
            });

        if (logError) {
            console.error('[adminForceRefund] Failed to create refund log:', logError);
            // We still return success:true for the main operation, but warn about the log
            return {
                success: true,
                message: `Booking marked as refunded (was "${booking.status}"), but audit log failed: ${logError.message}. Remember to process actual payment refund manually.`,
                newStatus: 'refunded',
            };
        }

        createNotification(
            'Booking Force-Refunded',
            `Admin refunded booking ${bookingId}.${reason ? ` Reason: ${reason}` : ''}`,
            'alert'
        );

        logAdminAction({
            action: 'force_refund',
            bookingId,
            table: sourceTable,
            previousStatus: booking.status,
            newStatus: 'refunded',
            details: reason,
            triggeredBy: 'admin',
        });

        return {
            success: true,
            message: `Booking marked as refunded (was "${booking.status}", table: ${sourceTable}). ${reason ? `Reason: ${reason}. ` : ''}Remember to process the actual payment refund via the provider dashboard.`,
            newStatus: 'refunded',
        };
    } catch (err) {
        console.error('[adminForceRefund] Error:', err);
        return { success: false, message: err instanceof Error ? err.message : 'Unexpected error' };
    }
}

/**
 * Admin restore a booking from a terminal state (cancelled / refunded / failed)
 * back to its previous status using metadata.previousStatus.
 */
export async function adminRestoreBooking(bookingId: string): Promise<RecoveryActionResult> {
    try {
        const supabase = createAdminClient();

        const result = await findBookingAcrossTables(supabase, bookingId);

        if (!result) {
            return { success: false, message: 'Booking not found' };
        }

        const { data: booking, table: sourceTable } = result;

        const terminalStatuses = ['cancelled', 'refunded', 'failed'];
        if (!terminalStatuses.includes(booking.status)) {
            return { success: false, message: `Booking is not in a terminal state (current: "${booking.status}")` };
        }

        const meta = booking.metadata as Record<string, unknown> | null;

        // Determine recovery status fallback based on table constraints
        let fallbackConfirmed = 'confirmed';
        if (sourceTable === 'flight_bookings') fallbackConfirmed = 'booked';

        const previousStatus = (meta?.previousStatus as string) || fallbackConfirmed;

        const now = new Date().toISOString();
        const hasMetadata = TABLES_WITH_METADATA.includes(sourceTable);
        const hasUpdatedAt = TABLES_WITH_UPDATED_AT.includes(sourceTable);

        const updatedMetadata = hasMetadata ? {
            ...(meta as object),
            restoredAt: now,
            restoredBy: 'admin',
            restoredFrom: booking.status,
        } : undefined;

        const updatePayload: Record<string, any> = {
            status: previousStatus,
        };
        if (hasUpdatedAt) updatePayload.updated_at = now;
        if (updatedMetadata) updatePayload.metadata = updatedMetadata;

        const { error: updateError } = await supabase
            .from(sourceTable)
            .update(updatePayload)
            .eq('id', bookingId);

        if (updateError) {
            return { success: false, message: `Failed to update: ${updateError.message}` };
        }

        createNotification(
            'Booking Restored',
            `Admin restored booking ${bookingId} from "${booking.status}" to "${previousStatus}".`,
            'system'
        );

        logAdminAction({
            action: 'restore_booking',
            bookingId,
            table: sourceTable,
            previousStatus: booking.status,
            newStatus: previousStatus,
            triggeredBy: 'admin',
        });

        return {
            success: true,
            message: `Booking restored from "${booking.status}" → "${previousStatus}" (table: ${sourceTable})`,
            newStatus: previousStatus,
        };
    } catch (err) {
        console.error('[adminRestoreBooking] Error:', err);
        return { success: false, message: err instanceof Error ? err.message : 'Unexpected error' };
    }
}

/**
 * Fetch monitoring data for the admin dashboard.
 * Includes failed bookings and payment-webhook mismatches.
 */
export async function getMonitoringData(): Promise<MonitoringData> {
    const supabase = createAdminClient();

    // 1. Failed Flight Bookings (from flight_bookings table)
    const { data: failedBookings, error: fbError } = await supabase
        .from('flight_bookings')
        .select('*')
        .eq('status', 'failed')
        .order('created_at', { ascending: false })
        .limit(50);

    // 2. Failed Unified Bookings
    const { data: failedUnified, error: fuError } = await supabase
        .from('unified_bookings')
        .select('*')
        .eq('status', 'failed')
        .order('created_at', { ascending: false })
        .limit(50);

    // 3. Payment-Webhook Mismatches
    // Logic: Session has payment_intent_id but no booking was created within 5 minutes.
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    // Fetch sessions with payment but not 'booked' or 'expired'
    const { data: potentialMismatches, error: pmError } = await supabase
        .from('booking_sessions')
        .select('*')
        .not('payment_intent_id', 'is', null)
        .not('status', 'eq', 'booked')
        .not('status', 'eq', 'expired')
        .lt('created_at', fiveMinutesAgo)
        .order('created_at', { ascending: false });

    // Filter out sessions that DO have a booking (just in case status didn't update)
    const sessionIds = (potentialMismatches || []).map(s => s.id);
    const { data: existingBookings } = await supabase
        .from('flight_bookings')
        .select('session_id')
        .in('session_id', sessionIds);

    const existingUnified = await supabase
        .from('unified_bookings')
        .select('id')
        .filter('metadata->>bookingSessionId', 'in', `(${sessionIds.join(',')})`);

    const bookedSessionIds = new Set([
        ...(existingBookings || []).map(b => b.session_id),
        // Unified might be harder to filter by session_id in a single query reliably without GIN index optimization
    ]);

    const mismatches = (potentialMismatches || []).filter(s => !bookedSessionIds.has(s.id));

    // 4. Awaiting Tickets (Mystifly async queue)
    const { data: awaitingRes, error: awaitingErr } = await supabase
        .from('flight_bookings')
        .select(`
            id, provider, pnr, total_price, currency, created_at, ticket_time_limit,
            session_id, booking_sessions(contact, passengers)
        `)
        .eq('status', 'awaiting_ticket')
        .order('ticket_time_limit', { ascending: true })
        .limit(100);

    const awaitingTickets = (awaitingRes || []).map(b => {
        const contact = (b.booking_sessions as any)?.contact;
        const customerName = (b.booking_sessions as any)?.passengers?.[0]
            ? `${(b.booking_sessions as any).passengers[0].firstName} ${(b.booking_sessions as any).passengers[0].lastName}`
            : contact?.email || 'Unknown';
            
        return {
            id: b.id,
            provider: b.provider,
            pnr: b.pnr,
            customerName: customerName,
            total_price: Number(b.total_price),
            currency: b.currency || 'USD',
            created_at: b.created_at,
            ticket_time_limit: b.ticket_time_limit
        };
    });

    return {
        failedBookings: [
            ...(failedBookings || []).map(b => ({ ...b, type: 'flight' })),
            ...(failedUnified || []).map(b => ({ ...b, type: b.type }))
        ],
        mismatches: mismatches.map(s => ({
            id: s.id,
            provider: s.provider,
            payment_intent_id: s.payment_intent_id,
            created_at: s.created_at,
            status: s.status,
            customer: (s.contact as any)?.email || 'Unknown'
        })),
        awaitingTickets,
        stats: {
            failedCount: (failedBookings?.length || 0) + (failedUnified?.length || 0),
            mismatchCount: mismatches.length,
            awaitingCount: awaitingTickets.length
        }
    };
}

/**
 * Manually retry a Duffel/Mystifly booking from a session.
 */
export async function adminRetryBooking(sessionId: string): Promise<RecoveryActionResult> {
    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !serviceRoleKey) {
            return { success: false, message: 'Server configuration error (missing keys)' };
        }

        const res = await fetch(`${supabaseUrl}/functions/v1/create-booking`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${serviceRoleKey}`,
            },
            body: JSON.stringify({ sessionId }),
        });

        const data = await res.json();

        if (data.success) {
            logAdminAction({
                action: 'retry_booking',
                sessionId,
                bookingId: data.bookingId,
                newStatus: data.status,
                details: `PNR: ${data.pnr || 'N/A'}`,
                triggeredBy: 'admin',
            });

            return {
                success: true,
                message: `Retry successful! PNR: ${data.pnr || 'N/A'}. Booking ID: ${data.bookingId || 'N/A'}`,
                newStatus: data.status
            };
        } else {
            logAdminAction({
                action: 'retry_booking',
                sessionId,
                details: `Failed: ${data.error || 'Unknown error'}`,
                triggeredBy: 'admin',
            });

            return {
                success: false,
                message: `Retry failed: ${data.error || 'Unknown error'}`
            };
        }
    } catch (err) {
        console.error('[adminRetryBooking] Error:', err);
        return { success: false, message: err instanceof Error ? err.message : 'Unexpected error during retry' };
    }
}

/**
 * Manually cancel a booking that is stuck in awaiting_ticket state.
 * Triggers stripe refund and sends cancellation emails.
 */
export async function adminCancelAwaitingTicket(bookingId: string): Promise<RecoveryActionResult> {
    try {
        const supabase = createAdminClient();

        const { data: booking, error: fetchErr } = await supabase
            .from('flight_bookings')
            .select(`
                *,
                flight_segments(*),
                booking_sessions(contact, passengers)
            `)
            .eq('id', bookingId)
            .single();

        if (fetchErr || !booking) {
            return { success: false, message: 'Booking not found' };
        }

        if (booking.status !== 'awaiting_ticket') {
            return { success: false, message: `Booking status is ${booking.status}, must be awaiting_ticket to use this action.` };
        }

        const refundAmount = Number(booking.total_price);
        const refundCurrency = booking.currency || 'USD';
        const paymentIntentId = booking.payment_intent_id;
        
        const now = new Date().toISOString();
        let stripeRefundId: string | undefined;

        // 1. Run Stripe Refund/Cancel if payment intent exists
        if (paymentIntentId && refundAmount > 0) {
            try {
                // First, check the status of the PaymentIntent
                const intent = await stripe.paymentIntents.retrieve(paymentIntentId);

                if (intent.status === 'requires_capture' || intent.status === 'requires_payment_method' || intent.status === 'requires_confirmation' || intent.status === 'requires_action') {
                    // Payment is uncaptured, cancel the intent
                    const canceledIntent = await stripe.paymentIntents.cancel(paymentIntentId, {
                        cancellation_reason: 'requested_by_customer'
                    });
                    stripeRefundId = canceledIntent.id; // Store the intent ID as the reference
                } else if (intent.status === 'succeeded') {
                    // Payment was fully captured, we need to issue a refund
                    const refundAmountCents = Math.round(refundAmount * 100);
                    const stripeRefund = await stripe.refunds.create({
                        payment_intent: paymentIntentId,
                        amount: refundAmountCents,
                        reason: 'requested_by_customer',
                        metadata: { bookingId, provider: booking.provider, action: 'manual_cancel_awaiting_ticket' },
                    }, {
                        idempotencyKey: `refund-awaiting-${bookingId}`
                    });
                    stripeRefundId = stripeRefund.id;
                } else if (intent.status === 'canceled') {
                    // Already canceled, just use the intent ID and proceed to clean up DB
                    stripeRefundId = intent.id;
                } else {
                    return { success: false, message: `PaymentIntent is in an unhandled state: ${intent.status}` };
                }

            } catch (stripeErr: any) {
                console.error('[adminCancelAwaitingTicket] Stripe action failed:', stripeErr);
                return { success: false, message: `Stripe action failed: ${stripeErr.message}` };
            }
        }

        // 2. Update Booking Status to refunded internally (since payment is returned)
        const logEntry = {
            at: now,
            oldStatus: 'awaiting_ticket',
            newStatus: 'refunded',
            note: 'Admin manually cancelled before expiry',
            stripeRefundId,
            refundAmount,
            currency: refundCurrency
        };

        const { error: updateErr } = await supabase
            .from('flight_bookings')
            .update({
                status: 'refunded', // Cancelled + Refunded 
                refund_amount: refundAmount,
                refund_currency: refundCurrency,
                cancellation_log: [...(booking.cancellation_log ?? []), logEntry],
                cancellation_requested_at: now,
                cancellation_completed_at: now
            })
            .eq('id', bookingId);
            
        if (updateErr) {
            return { success: false, message: `Database update failed: ${updateErr.message}` };
        }

        // 3. Fire Emails
        try {
            const session = booking.booking_sessions as any;
            const email = session?.contact?.email;
            
            if (email) {
                const pax0 = session?.passengers?.[0];
                const passengerName = pax0 ? `${pax0.firstName} ${pax0.lastName}` : 'Traveler';

                const segments = booking.flight_segments || [];
                const mappedSegments = segments.map((s: any) => ({
                    airline: s.airline,
                    flightNumber: s.flight_number,
                    origin: s.origin,
                    destination: s.destination,
                    departureTime: s.departure,
                    arrivalTime: s.arrival,
                }));

                const firstSeg = mappedSegments[0];
                const lastSeg = mappedSegments[mappedSegments.length - 1];
                const route = firstSeg && lastSeg ? `${firstSeg.origin} → ${lastSeg.destination}` : 'N/A';

                // Send Cancel Email
                await sendFlightCancellationEmail({
                    bookingId,
                    pnr: booking.pnr,
                    email,
                    passengerName,
                    segments: mappedSegments,
                    totalPaid: refundAmount,
                    refundAmount,
                    penaltyAmount: 0,
                    currency: refundCurrency,
                });

                // Send Refund Email immediately
                if (refundAmount > 0) {
                    await sendFlightCancellationRefundEmail({
                        bookingId,
                        pnr: booking.pnr,
                        email,
                        passengerName,
                        route,
                        refundAmount,
                        currency: refundCurrency,
                        stripeRefundId,
                    });
                }
            }
        } catch (emailErr) {
            console.error('[adminCancelAwaitingTicket] Failed to send emails:', emailErr);
            // Non-blocking log
        }

        createNotification(
            'Awaiting Ticket Cancelled',
            `Admin cancelled awaiting-ticket booking ${booking.pnr || bookingId} and issued refund.`,
            'alert'
        );

        logAdminAction({
            action: 'cancel_awaiting_ticket',
            bookingId,
            previousStatus: 'awaiting_ticket',
            newStatus: 'refunded',
            provider: booking.provider,
            details: `Refund: ${refundAmount} ${refundCurrency}${stripeRefundId ? `, Stripe: ${stripeRefundId}` : ''}`,
            triggeredBy: 'admin',
        });

        return {
            success: true,
            message: `Booking ${booking.pnr || bookingId} cancelled and refunded successfully.`,
            newStatus: 'refunded'
        };
    } catch (err) {
        console.error('[adminCancelAwaitingTicket] Error:', err);
        return { success: false, message: err instanceof Error ? err.message : 'Unexpected error' };
    }
}
