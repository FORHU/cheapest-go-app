import { NextResponse } from 'next/server';
import { requireAdmin, isAuthError } from '@/lib/server/admin';
import { saveAdminSettings } from '@/lib/server/admin/settings';
import { createNotification } from '@/lib/server/admin/notify';

export async function POST(req: Request) {
    try {
        const auth = await requireAdmin();
        if (isAuthError(auth)) return auth;

        const body = await req.json();
        const { settings } = body;

        if (!settings || typeof settings !== 'object') {
            return NextResponse.json({ success: false, error: 'Missing settings object' }, { status: 400 });
        }

        const result = await saveAdminSettings(settings);

        if (!result.success) {
            return NextResponse.json({ success: false, error: result.error }, { status: 500 });
        }

        createNotification('Settings Updated', `Admin settings updated by ${auth.user.email}.`, 'system');

        return NextResponse.json({ success: true, message: 'Settings saved' });
    } catch (e: any) {
        console.error('[Admin Settings API] Error:', e);
        return NextResponse.json({ success: false, error: e.message || 'Server error' }, { status: 500 });
    }
}
