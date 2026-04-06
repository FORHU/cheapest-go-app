import { sendBookingConfirmationEmail } from '@/lib/server/email';
import { getAuthenticatedUser } from '@/lib/server/auth';

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

        // Ensure the email target matches the authenticated user to prevent impersonation
        if (body.email && body.email !== user.email) {
            return Response.json(
                { success: false, error: 'Forbidden' },
                { status: 403 }
            );
        }

        const data = await sendBookingConfirmationEmail(body);
        return Response.json(data);
    } catch (err) {
        console.error('[/api/email]', err);
        return Response.json(
            { success: false, error: 'Failed to send email' },
            { status: 500 }
        );
    }
}
