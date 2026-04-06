import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isAuthError } from '@/lib/server/admin';
import { createNotification } from '@/lib/server/admin/notify';
import { createAdminClient } from '@/utils/supabase/admin';

export async function POST(req: NextRequest) {
    try {
        const auth = await requireAdmin();
        if (isAuthError(auth)) return auth;

        const body = await req.json();
        const { action, userId } = body;

        if (!userId || !action) {
            return NextResponse.json({ success: false, error: 'Missing userId or action' }, { status: 400 });
        }

        // Prevent admin from acting on themselves
        if (userId === auth.user.id) {
            return NextResponse.json({ success: false, error: 'Cannot perform this action on yourself' }, { status: 400 });
        }

        const supabase = createAdminClient();

        if (action === 'ban') {
            // Soft delete: set banned_at timestamp on profiles
            const { error } = await supabase
                .from('profiles')
                .update({ banned_at: new Date().toISOString() })
                .eq('id', userId);

            if (error) {
                console.error('[Admin Customers] Ban error:', error);
                return NextResponse.json({ success: false, error: error.message }, { status: 500 });
            }

            createNotification('User Banned', `User ${userId} has been banned by admin.`, 'alert');
            return NextResponse.json({ success: true, message: 'User has been banned' });
        }

        if (action === 'unban') {
            const { error } = await supabase
                .from('profiles')
                .update({ banned_at: null })
                .eq('id', userId);

            if (error) {
                console.error('[Admin Customers] Unban error:', error);
                return NextResponse.json({ success: false, error: error.message }, { status: 500 });
            }

            createNotification('User Unbanned', `User ${userId} has been unbanned by admin.`, 'system');
            return NextResponse.json({ success: true, message: 'User has been unbanned' });
        }

        if (action === 'hard_delete') {
            // Hard delete: remove from Supabase Auth (cascades to profiles via FK)
            const { error } = await supabase.auth.admin.deleteUser(userId);

            if (error) {
                console.error('[Admin Customers] Hard delete error:', error);
                return NextResponse.json({ success: false, error: error.message }, { status: 500 });
            }

            createNotification('User Deleted', `User ${userId} permanently deleted by admin.`, 'alert');
            return NextResponse.json({ success: true, message: 'User permanently deleted' });
        }

        return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
    } catch (e: any) {
        console.error('[Admin Customers API] Error:', e);
        return NextResponse.json({ success: false, error: e.message || 'Server error' }, { status: 500 });
    }
}
