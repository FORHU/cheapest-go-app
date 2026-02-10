import { getAuthenticatedUser } from '@/lib/server/auth';
import { getUserBookings } from '@/lib/server/bookings';

export async function POST(req: Request) {
    try {
        const { user, supabase, error: authError } = await getAuthenticatedUser();
        if (authError || !user) {
            return Response.json(
                { success: false, error: 'Authentication required' },
                { status: 401 }
            );
        }

        const data = await getUserBookings(user, supabase);
        return Response.json(data);
    } catch (err) {
        return Response.json(
            { success: false, error: String(err) },
            { status: 500 }
        );
    }
}
