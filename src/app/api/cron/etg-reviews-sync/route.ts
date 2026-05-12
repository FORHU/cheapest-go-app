import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/utils/env';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const ETG_BASE = 'https://api.worldota.net/api/b2b/v3';

function etgHeaders(): HeadersInit {
    const keyId = process.env.ETG_KEY_ID!;
    const apiKey = process.env.ETG_API_KEY!;
    const token = Buffer.from(`${keyId}:${apiKey}`).toString('base64');
    return {
        'Authorization': `Basic ${token}`,
        'Content-Type': 'application/json',
    };
}

interface ReviewRow {
    hotel_id: string;
    rating: number;
    reviews_count: number;
    synced_at: string;
}

/**
 * Parse the ETG reviews dump response.
 * ETG returns either:
 *   { data: { url: string } }         — async dump URL (download separately)
 *   { data: { hotels: [...] } }        — inline array
 *   { data: [ {...} ] }                — top-level array
 */
async function fetchReviewsData(): Promise<ReviewRow[]> {
    const res = await fetch(`${ETG_BASE}/hotel/incremental_reviews/dump/`, {
        method: 'POST',
        headers: etgHeaders(),
        body: JSON.stringify({}),
        // 60s read timeout handled by Vercel's function timeout
    });

    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`ETG reviews dump failed: ${res.status} ${text.slice(0, 200)}`);
    }

    const json = await res.json();
    console.log('[etg-reviews-sync] Response shape:', JSON.stringify(json).slice(0, 400));

    // Case 1: async dump URL — download and parse
    const dumpUrl = json?.data?.url || json?.url;
    if (dumpUrl) {
        return fetchDumpUrl(dumpUrl);
    }

    // Case 2: inline hotel array under data.hotels
    const hotelList: any[] =
        json?.data?.hotels ||
        (Array.isArray(json?.data) ? json.data : null) ||
        (Array.isArray(json?.hotels) ? json.hotels : null) ||
        [];

    return normalizeReviews(hotelList);
}

async function fetchDumpUrl(url: string): Promise<ReviewRow[]> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`ETG dump download failed: ${res.status}`);

    const text = await res.text();

    // NDJSON (one JSON object per line)
    if (text.trim().startsWith('{')) {
        const lines = text.split('\n').filter(Boolean);
        const parsed = lines.flatMap(line => {
            try { return [JSON.parse(line)]; } catch { return []; }
        });
        return normalizeReviews(parsed);
    }

    // Plain JSON array
    const arr = JSON.parse(text);
    return normalizeReviews(Array.isArray(arr) ? arr : arr?.hotels || []);
}

function normalizeReviews(list: any[]): ReviewRow[] {
    const now = new Date().toISOString();
    const rows: ReviewRow[] = [];
    for (const item of list) {
        // ETG uses `id` or `hid` for hotel identifier; rating is 0-10
        const id = String(item.id || item.hid || item.hotel_id || '');
        const rating = parseFloat(item.rating ?? item.stars ?? 0) || 0;
        const reviews_count = parseInt(item.reviews_count ?? item.total_reviews ?? 0) || 0;
        if (!id) continue;
        rows.push({ hotel_id: id, rating, reviews_count, synced_at: now });
    }
    return rows;
}

/**
 * GET /api/cron/etg-reviews-sync
 *
 * Called nightly by Vercel Cron (see vercel.json).
 * Downloads the ETG (RateHawk) bulk reviews dump, then upserts ratings into
 * the hotel_reviews table — keyed by numeric HID that TravelgateX returns.
 *
 * Only rows whose hotel_id exists in hotel_content are kept (hotels we've seen
 * in real searches), avoiding unbounded table growth from the full ETG catalog.
 */
export async function GET(req: NextRequest) {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!process.env.ETG_KEY_ID || !process.env.ETG_API_KEY) {
        return NextResponse.json(
            { error: 'ETG_KEY_ID / ETG_API_KEY env vars not set' },
            { status: 500 }
        );
    }

    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    try {
        // 1. Fetch dump from ETG
        const rows = await fetchReviewsData();
        console.log(`[etg-reviews-sync] Parsed ${rows.length} review rows from dump`);

        if (rows.length === 0) {
            return NextResponse.json({ success: true, synced: 0, message: 'Empty dump' });
        }

        // 2. Scope to hotel IDs we actually have in hotel_content (to keep the table small)
        const allIds = rows.map(r => r.hotel_id);
        const { data: knownContent } = await supabase
            .from('hotel_content')
            .select('hotel_id')
            .in('hotel_id', allIds);

        const knownIds = new Set((knownContent || []).map((r: any) => r.hotel_id));

        // If hotel_content is empty (fresh install), upsert everything so reviews
        // are immediately available once content starts populating.
        const toUpsert = knownIds.size > 0
            ? rows.filter(r => knownIds.has(r.hotel_id))
            : rows;

        console.log(`[etg-reviews-sync] Upserting ${toUpsert.length} matched rows`);

        // 3. Batch upsert in chunks of 500 to avoid request size limits
        const CHUNK = 500;
        let synced = 0;
        for (let i = 0; i < toUpsert.length; i += CHUNK) {
            const chunk = toUpsert.slice(i, i + CHUNK);
            const { error } = await supabase
                .from('hotel_reviews')
                .upsert(chunk, { onConflict: 'hotel_id' });
            if (error) {
                console.error('[etg-reviews-sync] Upsert error:', error.message);
            } else {
                synced += chunk.length;
            }
        }

        return NextResponse.json({ success: true, synced, total: rows.length });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[etg-reviews-sync] Fatal error:', message);
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}
