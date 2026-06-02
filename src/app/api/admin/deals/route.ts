import { createAdminClient } from '@/utils/postgres/admin';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isAuthError } from '@/lib/server/admin';
import { rateLimit } from '@/lib/server/rate-limit';
import { logAdminAction } from '@/lib/server/admin/audit';

export const dynamic = 'force-dynamic';

/** tab: 'vouchers' | 'flight_deals' | 'weekend_deals' */
export async function GET(req: NextRequest) {
    const rl = await rateLimit(req, { limit: 30, windowMs: 60_000, prefix: 'admin-deals' });
    if (!rl.success) return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });

    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    const { searchParams } = new URL(req.url);
    const tab = searchParams.get('tab') ?? 'vouchers';
    const q = searchParams.get('q')?.trim() ?? '';
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'));
    const pageSize = 20;
    const offset = (page - 1) * pageSize;

    const supabase = createAdminClient();

    if (tab === 'vouchers') {
        let query = supabase.from('vouchers').select('*', { count: 'exact' });
        if (q) query = query.or(`code.ilike.%${q}%,description.ilike.%${q}%`);
        const { data, error, count } = await query.order('created_at', { ascending: false }).range(offset, offset + pageSize - 1);
        if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

        // Usage counts
        const { data: usage } = await supabase.from('voucher_usage').select('voucher_id');
        const usageMap: Record<string, number> = {};
        (usage ?? []).forEach((u: any) => { usageMap[u.voucher_id] = (usageMap[u.voucher_id] ?? 0) + 1; });

        return NextResponse.json({
            success: true,
            data: (data ?? []).map((v: any) => ({ ...v, times_used: usageMap[v.id] ?? v.times_used ?? 0 })),
            total: count ?? 0, page, pageSize, totalPages: Math.ceil((count ?? 0) / pageSize),
        });
    }

    if (tab === 'flight_deals') {
        let query = supabase.from('flight_deals').select('*', { count: 'exact' });
        if (q) query = query.or(`origin.ilike.%${q}%,destination.ilike.%${q}%,airline.ilike.%${q}%`);
        const { data, error, count } = await query.order('updated_at', { ascending: false }).range(offset, offset + pageSize - 1);
        if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        return NextResponse.json({ success: true, data: data ?? [], total: count ?? 0, page, pageSize, totalPages: Math.ceil((count ?? 0) / pageSize) });
    }

    if (tab === 'weekend_deals') {
        let query = supabase.from('weekend_flight_deals').select('*', { count: 'exact' });
        if (q) query = query.or(`name.ilike.%${q}%,location.ilike.%${q}%`);
        const { data, error, count } = await query.order('created_at', { ascending: false }).range(offset, offset + pageSize - 1);
        if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        return NextResponse.json({ success: true, data: data ?? [], total: count ?? 0, page, pageSize, totalPages: Math.ceil((count ?? 0) / pageSize) });
    }

    return NextResponse.json({ success: false, error: 'Invalid tab' }, { status: 400 });
}

export async function POST(req: NextRequest) {
    const rl = await rateLimit(req, { limit: 20, windowMs: 60_000, prefix: 'admin-deals-post' });
    if (!rl.success) return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });

    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    const body = await req.json();
    const { action, tab, id, ids } = body;
    const supabase = createAdminClient();
    const tableMap: Record<string, string> = { vouchers: 'vouchers', flight_deals: 'flight_deals', weekend_deals: 'weekend_flight_deals' };
    const table = tableMap[tab];
    if (!table) return NextResponse.json({ success: false, error: 'Invalid tab' }, { status: 400 });

    const targets: string[] = ids ?? (id ? [id] : []);

    if (action === 'create') {
        const { action: _a, tab: _t, ...rest } = body;
        const { data, error } = await supabase.from(table).insert(rest).select().single();
        if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        logAdminAction({ action: `create_${tab}`, adminId: auth.user.id, adminEmail: auth.user.email, details: rest });
        return NextResponse.json({ success: true, data }, { status: 201 });
    }

    if (action === 'update') {
        if (!id) return NextResponse.json({ success: false, error: 'id required' }, { status: 400 });
        const { action: _a, tab: _t, id: _id, ids: _ids, ...updates } = body;
        const { error } = await supabase.from(table).update(updates).eq('id', id);
        if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        logAdminAction({ action: `update_${tab}`, adminId: auth.user.id, adminEmail: auth.user.email, targetId: id, details: updates });
        return NextResponse.json({ success: true });
    }

    if (action === 'toggle_active' && tab === 'vouchers') {
        if (!targets.length) return NextResponse.json({ success: false, error: 'id or ids required' }, { status: 400 });
        const { active } = body;
        const { error } = await supabase.from('vouchers').update({ active }).in('id', targets);
        if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        return NextResponse.json({ success: true });
    }

    if (action === 'delete') {
        if (!targets.length) return NextResponse.json({ success: false, error: 'id or ids required' }, { status: 400 });
        const { error } = await supabase.from(table).delete().in('id', targets);
        if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        logAdminAction({ action: `delete_${tab}`, adminId: auth.user.id, adminEmail: auth.user.email, details: { ids: targets } });
        return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
}
