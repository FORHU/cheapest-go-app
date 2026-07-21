import { createAdminClient } from '@/utils/postgres/admin';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isAuthError } from '@/lib/server/admin';
import { rateLimit } from '@/lib/server/rate-limit';
import { logAdminAction } from '@/lib/server/admin/audit';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const rl = await rateLimit(req, { limit: 30, windowMs: 60_000, prefix: 'admin-destinations' });
    if (!rl.success) return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });

    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q')?.trim() ?? '';
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'));
    const pageSize = 20;
    const offset = (page - 1) * pageSize;

    const supabase = createAdminClient();
    let query = supabase.from('popular_destinations').select('*', { count: 'exact' });
    if (q) query = query.or(`city.ilike.%${q}%,country.ilike.%${q}%`);

    const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + pageSize - 1);

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

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
    const rl = await rateLimit(req, { limit: 20, windowMs: 60_000, prefix: 'admin-destinations-post' });
    if (!rl.success) return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });

    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    const body = await req.json();
    const { action, id, city, country, image_url, average_price } = body;

    const supabase = createAdminClient();

    if (action === 'create') {
        if (!city?.trim() || !country?.trim()) {
            return NextResponse.json({ success: false, error: 'city and country are required' }, { status: 400 });
        }
        const { data, error } = await supabase
            .from('popular_destinations')
            .insert({ city: city.trim(), country: country.trim(), image_url: image_url ?? null, average_price: average_price ?? null })
            .select()
            .single();
        if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        logAdminAction({ action: 'create_destination', adminId: auth.user.id, adminEmail: auth.user.email, details: { city } });
        return NextResponse.json({ success: true, data }, { status: 201 });
    }

    if (action === 'update') {
        if (!id) return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });
        const updates: Record<string, unknown> = {};
        if (city !== undefined) updates.city = city;
        if (country !== undefined) updates.country = country;
        if (image_url !== undefined) updates.image_url = image_url;
        if (average_price !== undefined) updates.average_price = average_price;
        const { error } = await supabase.from('popular_destinations').update(updates).eq('id', id);
        if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        logAdminAction({ action: 'update_destination', adminId: auth.user.id, adminEmail: auth.user.email, targetId: id, details: updates });
        return NextResponse.json({ success: true });
    }

    if (action === 'delete') {
        const targets: string[] = body.ids ?? (id ? [id] : []);
        if (!targets.length) return NextResponse.json({ success: false, error: 'id or ids required' }, { status: 400 });
        const { error } = await supabase.from('popular_destinations').delete().in('id', targets);
        if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        logAdminAction({ action: 'delete_destination', adminId: auth.user.id, adminEmail: auth.user.email, details: { ids: targets } });
        return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
}
