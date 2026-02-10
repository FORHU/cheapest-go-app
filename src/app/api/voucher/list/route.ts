import { getAuthenticatedUser } from '@/lib/server/auth';
import { getAvailableVouchersServer } from '@/lib/server/vouchers';

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
        const promos = await getAvailableVouchersServer({
            bookingPrice: body.bookingPrice,
            currency: body.currency,
            hotelId: body.hotelId,
            locationCode: body.locationCode,
        });

        return Response.json({ success: true, data: promos });
    } catch (err) {
        return Response.json(
            { success: false, error: String(err) },
            { status: 500 }
        );
    }
}
