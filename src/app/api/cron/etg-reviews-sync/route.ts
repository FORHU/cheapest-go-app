import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/postgres/admin';
import { env } from '@/utils/env';
import zlib from 'zlib';

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

interface IndividualReviewRow {
    hotel_id: string;
    source_id: string;
    reviewer_name: string | null;
    review_date: string | null;
    score: number | null;
    pros: string | null;
    cons: string | null;
    traveler_type: string | null;
    language: string | null;
    headline: string | null;
    country: string | null;
    synced_at: string;
}

interface ParsedReviewsData {
    aggregates: ReviewRow[];
    individuals: IndividualReviewRow[];
}

/**
 * Parse the ETG reviews dump response.
 * ETG returns either:
 *   { data: { url: string } }         — async dump URL (download separately)
 *   { data: { hotels: [...] } }        — inline array
 *   { data: [ {...} ] }                — top-level array
 */
async function fetchReviewsData(): Promise<ParsedReviewsData> {
    const res = await fetch(`${ETG_BASE}/hotel/reviews/dump/`, {
        method: 'POST',
        headers: etgHeaders(),
        body: JSON.stringify({ language: 'en' }),
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
    const hotelList =
        json?.data?.hotels ||
        (Array.isArray(json?.data) ? json.data : null) ||
        (Array.isArray(json?.hotels) ? json.hotels : null) ||
        json?.data ||
        json ||
        [];

    return normalizeReviews(hotelList);
}

async function fetchDumpUrl(url: string): Promise<ParsedReviewsData> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`ETG dump download failed: ${res.status}`);

    const arrayBuffer = await res.arrayBuffer();
    let buffer = Buffer.from(arrayBuffer);

    // Decompress gzip feed manually since it is stored compressed on S3
    if (buffer[0] === 0x1f && buffer[1] === 0x8b) {
        console.log('[etg-reviews-sync] Decompressing S3 gzip feed...');
        buffer = zlib.gunzipSync(buffer);
    }

    const text = buffer.toString('utf8');

    let parsedData: any;
    try {
        parsedData = JSON.parse(text);
    } catch (e) {
        console.log('[etg-reviews-sync] JSON.parse failed, attempting line-by-line NDJSON parsing...');
        const lines = text.split('\n').filter(Boolean);
        parsedData = lines.flatMap(line => {
            try { return [JSON.parse(line)]; } catch { return []; }
        });
    }

    return normalizeReviews(parsedData);
}

function extractIndividualReviews(hotelId: string, rawReviews: any[]): IndividualReviewRow[] {
    const now = new Date().toISOString();
    return rawReviews.map((r: any, idx: number) => {
        // ETG review fields — handle multiple possible field names
        const sourceId = String(r.id || r.review_id || r.uid || `${hotelId}-${idx}`);
        const name = r.author || r.author_name || r.reviewer || r.user || r.name || null;
        const date = r.date || r.created_at || r.review_date || r.reviewed_at || null;
        const rawScore = r.rating ?? r.score ?? r.grade ?? r.mark ?? null;
        const score = rawScore !== null ? (parseFloat(rawScore) || null) : null;
        const pros = r.advantages || r.pros || r.positive || r.plus || r.good || null;
        const cons = r.disadvantages || r.cons || r.negative || r.minus || r.bad || null;
        const travelerType = r.traveler_type || r.category || r.type || r.group_type || null;
        const language = r.language || r.lang || null;
        const headline = r.headline || r.title || r.subject || null;
        const country = r.country || r.user_country || r.reviewer_country || null;

        // Log first item's raw structure on initial run to verify field mapping
        if (idx === 0 && hotelId) {
            console.log('[etg-reviews-sync] Sample review fields:', JSON.stringify(r).slice(0, 300));
        }

        return {
            hotel_id: hotelId,
            source_id: sourceId,
            reviewer_name: name ? String(name).slice(0, 200) : null,
            review_date: date ? String(date).slice(0, 50) : null,
            score,
            pros: pros ? String(pros).slice(0, 2000) : null,
            cons: cons ? String(cons).slice(0, 2000) : null,
            traveler_type: travelerType ? String(travelerType).slice(0, 100) : null,
            language: language ? String(language).slice(0, 10) : null,
            headline: headline ? String(headline).slice(0, 500) : null,
            country: country ? String(country).slice(0, 100) : null,
            synced_at: now,
        };
    });
}

function normalizeReviews(data: any): ParsedReviewsData {
    const now = new Date().toISOString();
    const aggregates: ReviewRow[] = [];
    const individuals: IndividualReviewRow[] = [];

    const processItem = (item: any) => {
        const id = String(item.id || item.hid || item.hotel_id || '');
        if (!id) return;

        const rawReviews = Array.isArray(item.reviews) ? item.reviews : [];
        const rating = parseFloat(item.rating ?? item.stars ?? 0) || 0;
        const reviews_count = parseInt(
            item.reviews_count ?? item.total_reviews ?? rawReviews.length
        ) || 0;

        aggregates.push({ hotel_id: id, rating, reviews_count, synced_at: now });

        if (rawReviews.length > 0) {
            individuals.push(...extractIndividualReviews(id, rawReviews));
        }
    };

    if (Array.isArray(data)) {
        for (const item of data) processItem(item);
    } else if (data && typeof data === 'object') {
        for (const key of Object.keys(data)) {
            if (data[key]) processItem(data[key]);
        }
    }

    return { aggregates, individuals };
}

/**
 * GET /api/cron/etg-reviews-sync
 *
 * Called nightly by Vercel Cron (see vercel.json).
 * Downloads the ETG (RateHawk) bulk reviews dump, upserts aggregated ratings
 * into hotel_reviews and individual review rows into hotel_review_items.
 * Both tables are keyed by numeric HID that TravelgateX returns.
 *
 * Only rows whose hotel_id exists in hotel_content are kept (hotels we've seen
 * in real searches), avoiding unbounded table growth from the full ETG catalog.
 */
export async function GET(req: NextRequest) {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!process.env.ETG_KEY_ID || !process.env.ETG_API_KEY) {
        return NextResponse.json(
            { error: 'ETG_KEY_ID / ETG_API_KEY env vars not set' },
            { status: 500 }
        );
    }

    const supabase = createAdminClient();

    try {
        // 1. Fetch dump from ETG
        const { aggregates, individuals } = await fetchReviewsData();
        console.log(`[etg-reviews-sync] Parsed ${aggregates.length} hotels, ${individuals.length} individual reviews`);

        if (aggregates.length === 0) {
            return NextResponse.json({ success: true, synced: 0, message: 'Empty dump' });
        }

        // 2. Scope to hotel IDs we actually have in hotel_content (to keep the table small)
        const allIds = aggregates.map(r => r.hotel_id);
        const { data: knownContent } = await supabase
            .from('hotel_content')
            .select('hotel_id')
            .in('hotel_id', allIds);

        const knownIds = new Set((knownContent || []).map((r: any) => r.hotel_id));

        // If hotel_content is empty (fresh install), upsert everything so reviews
        // are immediately available once content starts populating.
        const useAll = knownIds.size === 0;
        const toUpsertAgg = useAll ? aggregates : aggregates.filter(r => knownIds.has(r.hotel_id));
        const toUpsertInd = useAll ? individuals : individuals.filter(r => knownIds.has(r.hotel_id));

        console.log(`[etg-reviews-sync] Upserting ${toUpsertAgg.length} aggregate rows, ${toUpsertInd.length} individual reviews`);

        const CHUNK = 500;
        let syncedAgg = 0;
        let syncedInd = 0;

        // 3a. Upsert aggregate rows
        for (let i = 0; i < toUpsertAgg.length; i += CHUNK) {
            const chunk = toUpsertAgg.slice(i, i + CHUNK);
            const { error } = await supabase
                .from('hotel_reviews')
                .upsert(chunk as any[], { onConflict: 'hotel_id' });
            if (error) {
                console.error('[etg-reviews-sync] Aggregate upsert error:', error.message);
            } else {
                syncedAgg += chunk.length;
            }
        }

        // 3b. Upsert individual review rows
        for (let i = 0; i < toUpsertInd.length; i += CHUNK) {
            const chunk = toUpsertInd.slice(i, i + CHUNK);
            const { error } = await supabase
                .from('hotel_review_items')
                .upsert(chunk as any[], { onConflict: 'hotel_id,source_id' });
            if (error) {
                console.error('[etg-reviews-sync] Individual reviews upsert error:', error.message);
            } else {
                syncedInd += chunk.length;
            }
        }

        return NextResponse.json({
            success: true,
            aggregates: syncedAgg,
            individual_reviews: syncedInd,
            total_hotels: aggregates.length,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[etg-reviews-sync] Fatal error:', message);
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}
