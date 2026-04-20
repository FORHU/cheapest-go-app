import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { searchFlights } from '@/lib/server/flights/search-flights';
import { sendPriceAlertEmail } from '@/lib/server/email';
import { env } from '@/utils/env';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min — Vercel Pro/Enterprise

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * GET /api/cron/check-price-alerts
 *
 * Called daily by Vercel Cron (see vercel.json).
 * For each active alert, searches for the cheapest available fare and emails
 * the user if the price has dropped below their last-seen price (or target).
 *
 * Secured by CRON_SECRET env var — Vercel passes it via Authorization header.
 */
export async function GET(req: NextRequest) {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch all active alerts
    const { data: alerts, error } = await supabase
        .from('price_alerts')
        .select('*')
        .eq('is_active', true)
        .order('last_checked_at', { ascending: true, nullsFirst: true })
        .limit(100); // cap per run to stay within timeout

    if (error) {
        console.error('[check-price-alerts] DB error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const results = { checked: 0, alerted: 0, errors: 0 };

    // Pick a departure ~30 days out (generic forward date for price check)
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 30);
    const departureDate = targetDate.toISOString().slice(0, 10);

    for (const alert of (alerts ?? [])) {
        try {
            const offers = await searchFlights({
                origin: alert.origin,
                destination: alert.destination,
                departureDate,
                adults: alert.adults,
                children: 0,
                infants: 0,
                cabinClass: alert.cabin_class,
            });

            // Update last_checked_at regardless of outcome
            await supabase
                .from('price_alerts')
                .update({ last_checked_at: new Date().toISOString() })
                .eq('id', alert.id);

            if (!offers?.length) {
                results.checked++;
                continue;
            }

            // Cheapest offer
            const cheapest = offers.reduce((min: any, o: any) =>
                (o.price?.total ?? Infinity) < (min.price?.total ?? Infinity) ? o : min,
                offers[0]
            );
            const newPrice: number = cheapest.price?.total ?? 0;
            const currency: string = cheapest.price?.currency ?? alert.currency ?? 'USD';

            if (!newPrice) { results.checked++; continue; }

            const oldPrice: number | null = alert.current_price ? parseFloat(alert.current_price) : null;
            const targetPrice: number | null = alert.target_price ? parseFloat(alert.target_price) : null;

            // Should we alert?
            const priceDrop = oldPrice !== null && newPrice < oldPrice;
            const hitTarget = targetPrice !== null && newPrice <= targetPrice;
            const firstCheck = oldPrice === null;

            // Update current_price in DB
            await supabase
                .from('price_alerts')
                .update({ current_price: newPrice, currency })
                .eq('id', alert.id);

            if (priceDrop || hitTarget) {
                const siteUrl = env.SITE_URL ?? 'https://cheapestgo.com';
                const searchUrl = `${siteUrl}/flights/search?origin=${alert.origin}&destination=${alert.destination}&departure=${departureDate}&adults=${alert.adults}&cabin=${alert.cabin_class}`;

                const emailResult = await sendPriceAlertEmail({
                    email: alert.email,
                    origin: alert.origin,
                    destination: alert.destination,
                    newPrice,
                    oldPrice: firstCheck ? null : oldPrice,
                    currency,
                    cabin: alert.cabin_class,
                    adults: alert.adults,
                    searchUrl,
                });

                if (emailResult.success) results.alerted++;
                else console.error('[check-price-alerts] Email failed:', emailResult.error);
            }

            results.checked++;
        } catch (err) {
            console.error(`[check-price-alerts] Alert ${alert.id} error:`, err);
            results.errors++;
        }
    }

    return NextResponse.json({ success: true, ...results });
}
