import { getAuthenticatedUser } from '@/lib/server/auth';
import { getBookingDetailsLiteApi } from '@/lib/server/liteapi';

/**
 * POST /api/booking/backfill-policies
 *
 * Fetches fresh cancellation policy data from LiteAPI for all of
 * the current user's bookings and updates the DB.
 */
export async function POST() {
    try {
        const { user, supabase, error: authError } = await getAuthenticatedUser();
        if (authError || !user) {
            return Response.json(
                { success: false, error: 'Authentication required' },
                { status: 401 }
            );
        }

        // 1. Get all user bookings that are confirmed (worth backfilling)
        const { data: bookings, error: fetchError } = await supabase
            .from('bookings')
            .select('booking_id, cancellation_policy')
            .eq('user_id', user.id)
            .in('status', ['confirmed', 'pending']);

        if (fetchError) {
            return Response.json(
                { success: false, error: 'Failed to fetch bookings' },
                { status: 500 }
            );
        }

        if (!bookings?.length) {
            return Response.json({ success: true, updated: 0, message: 'No bookings to update' });
        }

        let updated = 0;
        const errors: string[] = [];

        for (const booking of bookings) {
            // Skip if already has full policy data
            const existing = booking.cancellation_policy as Record<string, unknown> | null;
            if (existing?.cancelPolicyInfos && Array.isArray(existing.cancelPolicyInfos) && existing.cancelPolicyInfos.length > 0) {
                continue; // Already has tier data
            }

            try {
                // Fetch fresh details from LiteAPI
                const result = await getBookingDetailsLiteApi({ bookingId: booking.booking_id });
                const details = result?.data;
                const freshPolicy = details?.cancellationPolicies;

                if (freshPolicy) {
                    // Update the DB with full policy data
                    const { error: updateError } = await supabase
                        .from('bookings')
                        .update({ cancellation_policy: freshPolicy })
                        .eq('booking_id', booking.booking_id);

                    if (updateError) {
                        errors.push(`${booking.booking_id}: DB update failed`);
                    } else {
                        updated++;
                        console.log(`[backfill] Updated policy for ${booking.booking_id}`);
                    }
                } else {
                    errors.push(`${booking.booking_id}: No policy data from LiteAPI`);
                }
            } catch (err) {
                errors.push(`${booking.booking_id}: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
        }

        return Response.json({
            success: true,
            total: bookings.length,
            updated,
            errors: errors.length > 0 ? errors : undefined,
        });
    } catch (err) {
        return Response.json(
            { success: false, error: String(err) },
            { status: 500 }
        );
    }
}
