import { getAuthenticatedUser } from '@/lib/server/auth';
import { recordVoucherUsage } from '@/lib/server/vouchers';

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
        const result = await recordVoucherUsage({
            supabase,
            voucherCode: body.voucherCode,
            userId: user.id,
            bookingId: body.bookingId,
            originalPrice: body.originalPrice,
            discountApplied: body.discountApplied,
            finalPrice: body.finalPrice,
            currency: body.currency,
        });

        return Response.json(result.success
            ? { success: true, data: { recorded: true } }
            : { success: false, error: result.error || 'Failed to record usage' }
        );
    } catch (err) {
        return Response.json(
            { success: false, error: String(err) },
            { status: 500 }
        );
    }
}
