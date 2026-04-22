import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/server/auth';
import { rateLimit } from '@/lib/server/rate-limit';

export const dynamic = 'force-dynamic';

/** GET /api/saved-trips — list the signed-in user's saved trips */
export async function GET(req: NextRequest) {
    const rl = rateLimit(req, { limit: 30, windowMs: 60_000, prefix: 'saved-trips-get' });
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    const { user, supabase, error: authError } = await getAuthenticatedUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type'); // 'flight' | 'hotel' | null (all)

    let query = supabase
        .from('saved_trips')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

    if (type === 'flight' || type === 'hotel') {
        query = query.eq('type', type);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, data });
}

/** POST /api/saved-trips — save a flight or hotel */
export async function POST(req: NextRequest) {
    const rl = rateLimit(req, { limit: 20, windowMs: 60_000, prefix: 'saved-trips-post' });
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    const { user, supabase, error: authError } = await getAuthenticatedUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let body: unknown;
    try { body = await req.json(); } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { type, title, subtitle, price, currency = 'USD', image_url, deep_link, snapshot } = body as Record<string, unknown>;

    if (type !== 'flight' && type !== 'hotel') {
        return NextResponse.json({ error: 'type must be flight or hotel' }, { status: 400 });
    }
    if (typeof title !== 'string' || !title.trim()) {
        return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }
    if (typeof deep_link !== 'string' || !deep_link.trim()) {
        return NextResponse.json({ error: 'deep_link is required' }, { status: 400 });
    }

    // Max 50 saved trips per user
    const { count } = await supabase
        .from('saved_trips')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id);

    if ((count ?? 0) >= 50) {
        return NextResponse.json({ error: 'Maximum 50 saved trips allowed' }, { status: 422 });
    }

    // Prevent duplicate saves (same deep_link)
    const { data: existing } = await supabase
        .from('saved_trips')
        .select('id')
        .eq('user_id', user.id)
        .eq('deep_link', deep_link)
        .maybeSingle();

    if (existing) {
        return NextResponse.json({ success: true, data: existing, duplicate: true });
    }

    const { data, error } = await supabase
        .from('saved_trips')
        .insert({
            user_id: user.id,
            type,
            title: String(title).slice(0, 200),
            subtitle: subtitle ? String(subtitle).slice(0, 300) : null,
            price: typeof price === 'number' ? price : null,
            currency: String(currency).toUpperCase().slice(0, 3),
            image_url: image_url ? String(image_url).slice(0, 500) : null,
            deep_link: String(deep_link).slice(0, 1000),
            snapshot: snapshot ?? null,
        })
        .select()
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, data }, { status: 201 });
}
