import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/server/rate-limit';
import { requireAdmin, isAuthError } from '@/lib/server/admin';
import { logAdminAction } from '@/lib/server/admin/audit';
import { getSqlAdmin } from '@/lib/db/postgres';

const CACHE_TABLES = [
    'hotel_search_cache',
    'dest_code_cache',
    'tgx_destination_cache',
    'place_cache',
    'flight_results_cache',
    'search_results_cache',
] as const;

export async function POST(req: NextRequest) {
    const rl = await rateLimit(req, { limit: 5, windowMs: 60_000, prefix: 'admin-cache-clear' });
    if (!rl.success) return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });

    try {
        const auth = await requireAdmin();
        if (isAuthError(auth)) return auth;

        const sql = getSqlAdmin();
        for (const table of CACHE_TABLES) {
            await sql`TRUNCATE ${sql(table)}`;
        }

        logAdminAction({
            action: 'clear_cache',
            adminId: auth.user.id,
            adminEmail: auth.user.email,
            details: { tables: CACHE_TABLES },
        });

        return NextResponse.json({ success: true, cleared: CACHE_TABLES });
    } catch (e: any) {
        console.error('[Admin Cache Clear] Error:', e);
        return NextResponse.json({ success: false, error: e.message || 'Server error' }, { status: 500 });
    }
}
