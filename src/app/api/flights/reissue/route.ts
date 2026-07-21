import { NextRequest, NextResponse } from 'next/server';
import { invokeEdgeFunction } from '@/utils/postgres/functions';
import { getAuthenticatedUser } from '@/lib/server/auth';
import { checkCsrf } from '@/lib/server/csrf';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    const csrfError = checkCsrf(req);
    if (csrfError) return csrfError;

    const { user, error: authError } = await getAuthenticatedUser();
    if (authError || !user || user.role !== 'admin') {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    if (!body.step || !['quote', 'execute'].includes(body.step)) {
        return NextResponse.json({ success: false, error: 'step must be "quote" or "execute"' }, { status: 400 });
    }
    try {
        const data = await invokeEdgeFunction('mystifly-reissue', body);
        return NextResponse.json(data);
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 502 });
    }
}
