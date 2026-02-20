import { getAuthenticatedUser } from '@/lib/server/auth';
import { validateVoucherServer } from '@/lib/server/vouchers';

export const dynamic = 'force-dynamic';

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
        const result = await validateVoucherServer({
            code: body.code,
            bookingPrice: body.bookingPrice,
            currency: body.currency,
            hotelId: body.hotelId,
            locationCode: body.locationCode,
            userId: user.id,
        });

        return Response.json({ success: true, data: result });
    } catch (err) {
        return Response.json(
            { success: false, error: String(err) },
            { status: 500 }
        );
    }
}
