/**
 * PATCH /api/account/password
 * Changes the authenticated user's password after verifying the current one.
 *
 * Replaces the previous flow that PUT to /api/auth/reset-password with a fake
 * token ('__current__') which never matched any password_reset_tokens row, so
 * the change always failed with "Invalid or expired reset token."
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/server/auth';
import { verifyPassword, updatePassword } from '@/lib/auth/session';
import { rateLimit } from '@/lib/server/rate-limit';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest) {
    const { user, error } = await getAuthenticatedUser();
    if (error || !user) {
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const rl = await rateLimit(req, { limit: 5, windowMs: 60_000, prefix: 'account-password' });
    if (!rl.success) {
        return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 });
    }

    const { currentPassword, newPassword } = await req.json().catch(() => ({}));

    if (!currentPassword || !newPassword) {
        return NextResponse.json({ error: 'Current and new password are required.' }, { status: 400 });
    }
    if (typeof newPassword !== 'string' || newPassword.length < 8) {
        return NextResponse.json({ error: 'New password must be at least 8 characters.' }, { status: 400 });
    }

    const valid = await verifyPassword(user.email, currentPassword);
    if (!valid) {
        return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 400 });
    }

    await updatePassword(user.id, newPassword);
    return NextResponse.json({ success: true });
}
