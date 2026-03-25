import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isAuthError } from '@/lib/server/admin';
import { searchAdmin } from '@/lib/server/admin/search';

export async function GET(req: NextRequest) {
    try {
        const auth = await requireAdmin();
        if (isAuthError(auth)) return auth;

        const q = req.nextUrl.searchParams.get('q')?.trim() || '';

        if (!q || q.length < 2) {
            return NextResponse.json({ bookings: [], customers: [], users: [] });
        }

        const results = await searchAdmin(q);
        return NextResponse.json(results);
    } catch (e: any) {
        console.error('[Admin Search API] Error:', e);
        return NextResponse.json({ success: false, error: e.message || 'Server error' }, { status: 500 });
    }
}
