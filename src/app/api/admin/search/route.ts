import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/server/rate-limit';
import { requireAdmin, isAuthError } from '@/lib/server/admin';
import { searchAdmin } from '@/lib/server/admin/search';

export async function GET(req: NextRequest) {
    const rl = await rateLimit(req, { limit: 30, windowMs: 60_000, prefix: 'admin-search' });
    if (!rl.success) return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });

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
