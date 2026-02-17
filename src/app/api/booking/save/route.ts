import { getAuthenticatedUser } from '@/lib/server/auth';
import { saveBookingToDatabase } from '@/lib/server/bookings';
import { getBookingDetailsLiteApi } from '@/lib/server/liteapi';
import { revalidatePath } from 'next/cache';

export async function POST(req: Request) {
    try {
        const { user, supabase, error: authError } = await getAuthenticatedUser();
        if (authError || !user) {
            return Response.json(
                { success: false, error: 'Authentication required' },
                { status: 401 }
            );
        }

        const body = await req.json();
        const data = await saveBookingToDatabase(body, user, supabase);

        // After saving, fetch fresh details from LiteAPI and update the policy
        // This ensures the DB always has full cancelPolicyInfos data
        if (data.success && body.bookingId) {
            try {
                const details = await getBookingDetailsLiteApi({ bookingId: body.bookingId });
                const freshPolicy = details?.data?.cancellationPolicies;

                if (freshPolicy?.cancelPolicyInfos) {
                    await supabase
                        .from('bookings')
                        .update({ cancellation_policy: freshPolicy })
                        .eq('booking_id', body.bookingId);
                    console.log(`[save] Updated policy for ${body.bookingId} with fresh LiteAPI data`);
                }
            } catch (policyErr) {
                // Non-critical — don't fail the save because of a policy refresh error
                console.error('[save] Failed to refresh policy data:', policyErr);
            }
        }

        // Revalidate trips page after saving
        if (data.success) {
            revalidatePath('/trips');
        }

        return Response.json(data);
    } catch (err) {
        return Response.json(
            { success: false, error: String(err) },
            { status: 500 }
        );
    }
}
