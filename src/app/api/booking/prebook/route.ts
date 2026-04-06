import { getAuthenticatedUser } from '@/lib/server/auth';
import { prebookRoom } from '@/lib/server/bookings';
import { safeError } from '@/lib/server/safe-error';
import { prebookSchema } from '@/lib/schemas/booking';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const parsed = prebookSchema.safeParse(body);
        if (!parsed.success) {
            return Response.json(
                { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid request' },
                { status: 400 }
            );
        }
        const data = await prebookRoom(parsed.data);
        return Response.json(data);
    } catch (err) {
        return Response.json(
            { success: false, error: safeError(err, 'prebook') },
            { status: 500 }
        );
    }
}
