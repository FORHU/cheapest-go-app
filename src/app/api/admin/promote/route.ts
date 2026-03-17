import { NextResponse } from 'next/server';
import { requireAdmin, isAuthError } from '@/lib/server/admin';
import { createAdminClient } from '@/utils/supabase/admin';

export async function POST(req: Request) {
    try {
        const auth = await requireAdmin();
        if (isAuthError(auth)) return auth;

        const body = await req.json();
        const { userId, newRole } = body;

        if (!userId || typeof userId !== 'string') {
            return NextResponse.json(
                { success: false, error: 'Missing or invalid userId' },
                { status: 400 }
            );
        }

        if (!['user', 'admin'].includes(newRole)) {
            return NextResponse.json(
                { success: false, error: 'Invalid role. Must be "user" or "admin"' },
                { status: 400 }
            );
        }

        // Prevent self-demotion (would lock the admin out)
        if (userId === auth.user.id && newRole !== 'admin') {
            return NextResponse.json(
                { success: false, error: 'Cannot demote yourself' },
                { status: 400 }
            );
        }

        const adminSupabase = createAdminClient();

        // 1. Update profiles table (authoritative source of truth)
        const { error: profileError } = await adminSupabase
            .from('profiles')
            .update({ role: newRole })
            .eq('id', userId);

        if (profileError) {
            console.error('[Admin Promote] Profile update error:', profileError);
            return NextResponse.json(
                { success: false, error: 'Failed to update profile role' },
                { status: 500 }
            );
        }

        // 2. Sync user_metadata so client-side extraction stays consistent
        const { error: metadataError } = await adminSupabase.auth.admin.updateUserById(
            userId,
            { user_metadata: { role: newRole } }
        );

        if (metadataError) {
            // Non-fatal: profiles table is already updated
            console.error('[Admin Promote] Metadata sync error:', metadataError);
        }

        console.log(`[Admin Promote] User ${userId} role updated to ${newRole} by ${auth.user.email}`);

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
