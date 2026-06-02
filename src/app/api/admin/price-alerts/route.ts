import { createAdminClient } from '@/utils/postgres/admin';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isAuthError } from '@/lib/server/admin';
import { rateLimit } from '@/lib/server/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const rl = await rateLimit(req, { limit: 30, windowMs: 60_000, prefix: 'admin-price-alerts' });
    if (!rl.success) return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });

    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'));
    const pageSize = 20;
    const q = searchParams.get('q')?.trim() ?? '';
    const status = searchParams.get('status') ?? 'all'; // 'active' | 'inactive' | 'all'
    const offset = (page - 1) * pageSize;

    const supabase = createAdminClient();

    let query = supabase
        .from('price_alerts')
        .select('*, profiles:user_id(email, full_name)', { count: 'exact' });

    if (status === 'active') query = query.eq('is_active', true);
    else if (status === 'inactive') query = query.eq('is_active', false);

    if (q) {
        query = query.or(`origin.ilike.%${q}%,destination.ilike.%${q}%,email.ilike.%${q}%`);
    }

    const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + pageSize - 1);

    if (error) {
        console.error('[admin/price-alerts] GET error:', error.message);
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
    const rl = await rateLimit(req, { limit: 20, windowMs: 60_000, prefix: 'admin-price-alerts-post' });
    if (!rl.success) return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });

    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    const { action, id, ids } = await req.json();

    if (!action) return NextResponse.json({ success: false, error: 'action is required' }, { status: 400 });

    const supabase = createAdminClient();

    if (action === 'deactivate' || action === 'activate') {
        const targets = ids ?? (id ? [id] : []);
        if (!targets.length) return NextResponse.json({ success: false, error: 'id or ids required' }, { status: 400 });

        const { error } = await supabase
            .from('price_alerts')
            .update({ is_active: action === 'activate' })
            .in('id', targets);

        if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        return NextResponse.json({ success: true });
    }

    if (action === 'delete') {
        const targets = ids ?? (id ? [id] : []);
        if (!targets.length) return NextResponse.json({ success: false, error: 'id or ids required' }, { status: 400 });

        const { error } = await supabase.from('price_alerts').delete().in('id', targets);
        if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
}
