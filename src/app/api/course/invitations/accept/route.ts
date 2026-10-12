import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUser } from '@/lib/server/auth';
import { checkCsrf } from '@/lib/server/csrf';
import { rateLimit } from '@/lib/server/rate-limit';
import { acceptInvitation } from '@/lib/server/golf/invitations';
import { CourseStaffError } from '@/lib/server/golf/errors';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({ token: z.string().min(10).max(200) });

function fail(status: number, error: string, extra: Record<string, unknown> = {}) {
    return NextResponse.json({ success: false, error, ...extra }, { status });
}

/** Accepts an invitation as the signed-in account. Never on a GET: opening a link changes nothing. */
export async function POST(req: NextRequest) {
    const csrf = checkCsrf(req);
    if (csrf) return csrf;

    const { user } = await getAuthenticatedUser();
    if (!user) return fail(401, 'Please sign in to accept this invitation.');

    const rl = await rateLimit(req, { limit: 10, windowMs: 3_600_000, prefix: 'course-invitation-accept', userId: user.id });
    if (!rl.success) return fail(429, 'Too many attempts. Please try again later.');

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail(400, 'An invitation token is required.');

    try {
        const accepted = await acceptInvitation({ token: parsed.data.token, userId: user.id, userEmail: user.email });
        return NextResponse.json({ success: true, data: accepted });
    } catch (err) {
        if (err instanceof CourseStaffError) return fail(err.httpStatus, err.message, { code: err.code });
        throw err;
    }
}
