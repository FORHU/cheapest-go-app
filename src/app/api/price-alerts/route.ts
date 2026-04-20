import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUser } from '@/lib/server/auth';
import { rateLimit } from '@/lib/server/rate-limit';
import { env } from '@/utils/env';
import { sendPriceAlertConfirmationEmail } from '@/lib/server/email';

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const VALID_CABINS = new Set(['economy', 'premium_economy', 'business', 'first']);

/** GET /api/price-alerts — list the signed-in user's alerts */
export async function GET(req: NextRequest) {
    const rl = rateLimit(req, { limit: 30, windowMs: 60_000, prefix: 'price-alerts-get' });
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    const { user, supabase, error: authError } = await getAuthenticatedUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data, error } = await supabase
        .from('price_alerts')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, data });
}

import { sendPriceAlertConfirmationEmail } from '@/lib/server/email';

export async function POST(req: NextRequest) {
    const rl = rateLimit(req, { limit: 10, windowMs: 60_000, prefix: 'price-alerts-post' });
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    const { user, supabase, error: authError } = await getAuthenticatedUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let body: unknown;
    try { body = await req.json(); } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { origin, destination, cabin_class = 'economy', adults = 1, target_price } = body as Record<string, unknown>;

    if (typeof origin !== 'string' || !/^[A-Z]{3}$/.test(origin)) {
        return NextResponse.json({ error: 'Invalid origin IATA code' }, { status: 400 });
    }
    if (typeof destination !== 'string' || !/^[A-Z]{3}$/.test(destination)) {
        return NextResponse.json({ error: 'Invalid destination IATA code' }, { status: 400 });
    }
    if (!VALID_CABINS.has(cabin_class as string)) {
        return NextResponse.json({ error: 'Invalid cabin class' }, { status: 400 });
    }
    const adultsNum = typeof adults === 'number' ? adults : parseInt(String(adults));
    if (isNaN(adultsNum) || adultsNum < 1 || adultsNum > 9) {
        return NextResponse.json({ error: 'adults must be 1–9' }, { status: 400 });
    }

    // Limit: max 10 active alerts per user
    const { count } = await supabase
        .from('price_alerts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_active', true);

    if ((count ?? 0) >= 10) {
        return NextResponse.json({ error: 'Maximum 10 active alerts allowed' }, { status: 422 });
    }

    const { data, error } = await supabase
        .from('price_alerts')
        .insert({
            user_id: user.id,
            email: user.email!,
            origin,
            destination,
            cabin_class: cabin_class as string,
            adults: adultsNum,
            target_price: typeof target_price === 'number' && target_price > 0 ? target_price : null,
        })
        .select()
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Send confirmation email in background
    if (data) {
        void sendPriceAlertConfirmationEmail({
            email: user.email!,
            origin: data.origin,
            destination: data.destination,
            cabin: data.cabin_class,
            adults: data.adults,
            alertId: data.id
        }).catch(err => console.error('[PriceAlert] Email failed:', err));
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
}
