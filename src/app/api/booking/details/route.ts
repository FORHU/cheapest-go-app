import { createAdminClient } from '@/utils/postgres/admin';
import { getAuthenticatedUser } from '@/lib/server/auth';
import { getBookingDetails } from '@/lib/server/bookings';

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
    try {
        const { user, error: authError } = await getAuthenticatedUser();
        const supabase = createAdminClient();
        if (authError || !user) {
            return Response.json(
                { success: false, error: 'Authentication required' },
                { status: 401 }
            );
        }

        const body = await req.json();
        const { bookingId } = body;

        const data = await getBookingDetails(bookingId, user, supabase);
        return Response.json(data);
    } catch (err) {
        return Response.json(
            { success: false, error: String(err) },
            { status: 500 }
        );
    }
}
