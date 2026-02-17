import { getAuthenticatedUser } from '@/lib/server/auth';
import { confirmAndSaveBooking } from '@/lib/server/bookings';
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

        // Unified flow: LiteAPI confirm → normalize policy → atomic DB save
        const result = await confirmAndSaveBooking(body, user);

        if (result.success) {
            revalidatePath('/trips');
        }

        return Response.json(result);
    } catch (err) {
        return Response.json(
            { success: false, error: String(err) },
            { status: 500 }
        );
    }
}
