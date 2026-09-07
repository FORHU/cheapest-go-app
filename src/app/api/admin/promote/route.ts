import { createAdminClient } from '@/utils/postgres/admin';
import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/server/rate-limit';
import { requireAdmin, isAuthError } from '@/lib/server/admin';
import { createNotification } from '@/lib/server/admin/notify';
import { logAdminAction } from '@/lib/server/admin/audit';
import { validateRoleChange } from '@/lib/server/admin/roleChange';
import { roleLabel } from '@/lib/auth/roles';

export async function POST(req: NextRequest) {
    const rl = await rateLimit(req, { limit: 10, windowMs: 60_000, prefix: 'admin-promote' });
    if (!rl.success) return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });

    try {
        const auth = await requireAdmin();
        if (isAuthError(auth)) return auth;

        const body = await req.json();

        const change = validateRoleChange({
            actorId: auth.user.id,
            targetId: body?.userId,
            newRole: body?.newRole,
        });
        if (!change.ok) {
            return NextResponse.json({ success: false, error: change.error }, { status: 400 });
        }
        const { targetId: userId, newRole } = change;

        const adminSupabase = createAdminClient();

        /*
         * One write, to `users`.
         *
         * This route used to update `profiles.role` first and treat it as the source of
         * truth. That column was dropped in 20260619000001 — ADR-0003 makes `users.role`
         * authoritative — so the update failed, and because the failure was fatal the route
         * returned 500 before ever reaching `users`. Promotion through the admin has been
         * broken since; the only way to make someone an admin was `scripts/make-admin.mjs`.
         */
        const { error: userError } = await adminSupabase
            .from('users')
            .update({ role: newRole })
            .eq('id', userId);

        if (userError) {
            console.error('[Admin Promote] Role update error:', userError);
            return NextResponse.json(
                { success: false, error: 'Failed to update role' },
                { status: 500 }
            );
        }

        logAdminAction({
            action: 'promote_user',
            adminId: auth.user.id,
            adminEmail: auth.user.email,
            targetId: userId,
            details: { newRole },
        });

        createNotification(
            'User role changed',
            // Named rather than "promoted" or "demoted": with three roles, support_agent is
            // neither, and calling it one of them would say something untrue in the log.
            `User ${userId} is now ${roleLabel(newRole)} (changed by ${auth.user.email}).`,
            'system'
        );

        return NextResponse.json({
            success: true,
            message: `User role updated to ${newRole}`,
        });
    } catch (e: any) {
        console.error('[Admin Promote] Error:', e);
        return NextResponse.json(
            { success: false, error: e.message || 'Internal Server Error' },
            { status: 500 }
        );
    }
}
