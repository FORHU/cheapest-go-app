import { createAdminClient } from '@/utils/supabase/admin';
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
        stats: {
            failedCount: (failedBookings?.length || 0) + (failedUnified?.length || 0),
            mismatchCount: mismatches.length
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
            return {
                success: true,
                message: `Retry successful! PNR: ${data.pnr || 'N/A'}. Booking ID: ${data.bookingId || 'N/A'}`,
                newStatus: data.status
            };
        } else {
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
