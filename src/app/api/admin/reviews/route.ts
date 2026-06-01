import { createAdminClient } from '@/utils/postgres/admin';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isAuthError } from '@/lib/server/admin';
import { createAdminClient } from '@/utils/supabase/admin';
import { rateLimit } from '@/lib/server/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const rl = await rateLimit(req, { limit: 30, windowMs: 60_000, prefix: 'admin-reviews' });
    if (!rl.success) return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });

    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'));
    const pageSize = 20;
    const q = searchParams.get('q')?.trim() ?? '';
    const offset = (page - 1) * pageSize;

    const supabase = createAdminClient();

    let query = supabase
        .from('hotel_reviews')
        .select('*', { count: 'exact' });

    if (q) {
        query = query.or(`hotel_id.ilike.%${q}%,reviewer_name.ilike.%${q}%`);
    }

    const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + pageSize - 1);

    if (error) {
        console.error('[admin/reviews] GET error:', error.message);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
        success: true,
        data: data ?? [],
        total: count ?? 0,
        page,
        pageSize,
        totalPages: Math.ceil((count ?? 0) / pageSize),
    });
}

export async function POST(req: NextRequest) {
    const rl = await rateLimit(req, { limit: 20, windowMs: 60_000, prefix: 'admin-reviews-post' });
    if (!rl.success) return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });

    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    const { action, id, ids } = await req.json();

    if (!action) return NextResponse.json({ success: false, error: 'action is required' }, { status: 400 });

    const supabase = createAdminClient();
    const targets: string[] = ids ?? (id ? [id] : []);
    if (!targets.length) return NextResponse.json({ success: false, error: 'id or ids required' }, { status: 400 });

    if (action === 'delete') {
        const { error } = await supabase.from('hotel_reviews').delete().in('id', targets);
        if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
}
