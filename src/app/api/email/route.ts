import { sendBookingConfirmationEmail } from '@/lib/server/email';
import { getAuthenticatedUser } from '@/lib/server/auth';
import { rateLimit } from '@/lib/server/rate-limit';
import { checkCsrf } from '@/lib/server/csrf';
import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    const csrfError = checkCsrf(req);
    if (csrfError) return csrfError;

    // 3 emails per minute per IP
    const rl = rateLimit(req, { limit: 3, windowMs: 60_000, prefix: 'email-send' });
    if (!rl.success) {
        return Response.json({ success: false, error: 'Too many requests. Please wait before trying again.' }, { status: 429 });
    }

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
