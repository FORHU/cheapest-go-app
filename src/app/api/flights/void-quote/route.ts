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

    const { mfRef, passengers, originDestinations } = await req.json();
    if (!mfRef) return NextResponse.json({ success: false, error: 'mfRef is required' }, { status: 400 });
    if (!passengers?.length) return NextResponse.json({ success: false, error: 'passengers array is required' }, { status: 400 });
    if (!originDestinations?.length) return NextResponse.json({ success: false, error: 'originDestinations array is required' }, { status: 400 });
    try {
        const data = await invokeEdgeFunction('mystifly-void-quote', { mfRef, passengers, originDestinations });
        return NextResponse.json(data);
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 502 });
    }
}
