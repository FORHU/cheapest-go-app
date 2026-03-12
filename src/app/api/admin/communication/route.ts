import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getEmailLogs, retryEmailLog } from '@/lib/server/admin/communication';

export async function GET(req: Request) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single();

        if (profile?.role !== 'admin') {
            return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
        }

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
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single();

        if (profile?.role !== 'admin') {
            return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
        }

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
