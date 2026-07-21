import { createAdminClient } from '@/utils/postgres/admin';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isAuthError } from '@/lib/server/admin';
import { rateLimit } from '@/lib/server/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const rl = await rateLimit(req, { limit: 30, windowMs: 60_000, prefix: 'admin-saved-trips' });
    if (!rl.success) return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });

    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q')?.trim() ?? '';
    const type = searchParams.get('type') ?? 'all';
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'));
    const pageSize = 20;
    const offset = (page - 1) * pageSize;

    const supabase = createAdminClient();

    let query = supabase.from('saved_trips').select('*', { count: 'exact' });
    if (type === 'flight' || type === 'hotel') query = query.eq('type', type);
    if (q) query = query.or(`title.ilike.%${q}%,subtitle.ilike.%${q}%`);

    const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + pageSize - 1);

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

    // Stats
    const [{ count: totalCount }, { count: flightCount }, { count: hotelCount }] = await Promise.all([
        supabase.from('saved_trips').select('*', { count: 'exact', head: true }),
        supabase.from('saved_trips').select('*', { count: 'exact', head: true }).eq('type', 'flight'),
        supabase.from('saved_trips').select('*', { count: 'exact', head: true }).eq('type', 'hotel'),
    ]);

    return NextResponse.json({
        success: true,
        data: data ?? [],
        total: count ?? 0,
        page,
        pageSize,
        totalPages: Math.ceil((count ?? 0) / pageSize),
        stats: { total: totalCount ?? 0, flights: flightCount ?? 0, hotels: hotelCount ?? 0 },
    });
}

export async function POST(req: NextRequest) {
    const rl = await rateLimit(req, { limit: 20, windowMs: 60_000, prefix: 'admin-saved-trips-post' });
    if (!rl.success) return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });

    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    const { action, id, ids } = await req.json();
    const supabase = createAdminClient();
    const targets: string[] = ids ?? (id ? [id] : []);

    if (action === 'delete') {
        if (!targets.length) return NextResponse.json({ success: false, error: 'id or ids required' }, { status: 400 });
        const { error } = await supabase.from('saved_trips').delete().in('id', targets);
        if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
}
