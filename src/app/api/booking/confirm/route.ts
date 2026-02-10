import { getAuthenticatedUser } from '@/lib/server/auth';
import { confirmBooking } from '@/lib/server/bookings';
import { revalidatePath } from 'next/cache';

export async function POST(req: Request) {
    try {
        const { user, error: authError } = await getAuthenticatedUser();
        if (authError || !user) {
            return Response.json(
                { success: false, error: 'Authentication required' },
                { status: 401 }
            );
        }

        const body = await req.json();
        const data = await confirmBooking(body);

        // Revalidate trips page after successful booking
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
