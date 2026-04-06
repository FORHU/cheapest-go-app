import { NextResponse } from 'next/server';
import { requireAdmin, isAuthError } from '@/lib/server/admin';
import { getEmailLogs, retryEmailLog } from '@/lib/server/admin/communication';

export async function GET(req: Request) {
    try {
        const auth = await requireAdmin();
        if (isAuthError(auth)) return auth;

        const { searchParams } = new URL(req.url);
        const page = parseInt(searchParams.get('page') || '1');
        const pageSize = parseInt(searchParams.get('pageSize') || '20');
        const bookingId = searchParams.get('bookingId') || undefined;
        const status = searchParams.get('status') || undefined;
        const type = searchParams.get('type') || undefined;

        const result = await getEmailLogs({ page, pageSize, bookingId, status, type });
        return NextResponse.json({ success: true, ...result });
    } catch (e: any) {
        console.error('[Admin Communication API] GET Error:', e);
        return NextResponse.json({ success: false, error: e.message || 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const auth = await requireAdmin();
        if (isAuthError(auth)) return auth;

        const body = await req.json();
        const { action, logId } = body;

        if (action === 'retry') {
            if (!logId) {
                return NextResponse.json({ success: false, error: 'Missing logId' }, { status: 400 });
            }
            const result = await retryEmailLog(logId);
            return NextResponse.json(result);
        }

        return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
    } catch (e: any) {
        console.error('[Admin Communication API] POST Error:', e);
        return NextResponse.json({ success: false, error: e.message || 'Internal Server Error' }, { status: 500 });
    }
}
