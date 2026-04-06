import { NextResponse } from 'next/server';
import {
    requireAdmin,
    isAuthError,
    getNotifications,
    markNotificationAsRead,
    markAllNotificationsAsRead,
} from '@/lib/server/admin';

export async function GET() {
    try {
        const auth = await requireAdmin();
        if (isAuthError(auth)) return auth;

        const notifications = await getNotifications();
        return NextResponse.json(notifications);
    } catch (e: any) {
        console.error('[Admin Notifications API] GET Error:', e);
        return NextResponse.json({ success: false, error: e.message || 'Server error' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const auth = await requireAdmin();
        if (isAuthError(auth)) return auth;

        const body = await req.json();
        const { action, id } = body;

        if (action === 'markRead') {
            const success = await markNotificationAsRead(id);
            return NextResponse.json({ success });
        } else if (action === 'markAllRead') {
            const success = await markAllNotificationsAsRead();
            return NextResponse.json({ success });
        }

        return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
    } catch (e: any) {
        console.error('[Admin Notifications API] POST Error:', e);
        return NextResponse.json({ success: false, error: e.message || 'Server error' }, { status: 500 });
    }
}
