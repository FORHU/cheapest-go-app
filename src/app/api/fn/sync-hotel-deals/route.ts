/**
 * POST /api/fn/sync-hotel-deals
 *
 * Searches TGX for the best hotel deal in each of the curated destination
 * cities, then upserts them into weekend_flight_deals for the landing page.
 *
 * Called by /api/cron/sync-hotel-deals (scheduled daily at 05:00 UTC).
 * Can also be triggered manually:
 *   curl -X POST https://<host>/api/fn/sync-hotel-deals \
 *        -H "Authorization: Bearer $FUNCTIONS_SECRET"
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSqlAdmin } from '@/lib/db/postgres';
import { runTgxSearch } from '@/lib/server/stays/travelgatex/search';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function checkAuth(req: NextRequest): boolean {
    const secret = process.env.FUNCTIONS_SECRET || process.env.INTERNAL_SECRET;
    if (!secret) return true; // dev mode — allow without auth
    return req.headers.get('authorization') === `Bearer ${secret}`;
}

// ── Target destinations ───────────────────────────────────────────────────────
// One deal is picked per city and shown on the landing page carousel.
// Order matters: the first city whose search returns results becomes row #1.
const DESTINATIONS = [
    { city: 'Manila',        countryCode: 'PH' },
    { city: 'Cebu',          countryCode: 'PH' },
    { city: 'Boracay',       countryCode: 'PH' },
    { city: 'Bangkok',       countryCode: 'TH' },
    { city: 'Phuket',        countryCode: 'TH' },
    { city: 'Tokyo',         countryCode: 'JP' },
    { city: 'Osaka',         countryCode: 'JP' },
    { city: 'Bali',          countryCode: 'ID' },
    { city: 'Singapore',     countryCode: 'SG' },
    { city: 'Seoul',         countryCode: 'KR' },
    { city: 'Kuala Lumpur',  countryCode: 'MY' },
    { city: 'Dubai',         countryCode: 'AE' },
    { city: 'Hong Kong',     countryCode: 'HK' },
    { city: 'Da Nang',       countryCode: 'VN' },
    { city: 'Taipei',        countryCode: 'TW' },
];

// ── Date helpers ──────────────────────────────────────────────────────────────

function nextFriday(): string {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const daysAway = (5 - d.getDay() + 7) % 7 || 7; // 5 = Friday
    d.setDate(d.getDate() + daysAway);
    return d.toISOString().slice(0, 10);
}

function nextSaturday(): string {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const daysAway = (5 - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + daysAway + 1); // Friday + 1
    return d.toISOString().slice(0, 10);
}

// ── Deal selection ────────────────────────────────────────────────────────────

/**
 * Score = (reviewRating × log(reviews + 1)) / log(price + 1)
 * Rewards highly-rated, well-reviewed hotels without blindly picking the cheapest.
 */
function dealScore(hotel: any): number {
    const rating  = Number(hotel.reviewRating ?? hotel.rating ?? 0);
    const reviews = Number(hotel.reviews ?? hotel.reviewCount ?? 0);
    const price   = Number(hotel.price ?? 0);
    if (price <= 0) return 0;
    return (rating * Math.log(reviews + 1)) / Math.log(price + 1);
}

function pickBadge(hotel: any): string {
    if (hotel.refundableTag === 'REFUNDABLE') return 'Free cancellation';
    const r = Number(hotel.reviewRating ?? 0);
    if (r >= 9)   return 'Exceptional';
    if (r >= 8.5) return 'Guest Favourite';
    if (r >= 8)   return 'Highly Rated';
    return 'Great Value';
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
    if (!checkAuth(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const checkin  = nextFriday();
    const checkout = nextSaturday();
    const sql      = getSqlAdmin();
    const now      = new Date().toISOString();

    const upserted: string[] = [];
    const skipped:  string[] = [];
    const errors:   string[] = [];

    console.log(`[sync-hotel-deals] Starting — checkin: ${checkin}, checkout: ${checkout}`);

    for (const dest of DESTINATIONS) {
        try {
            const result = await runTgxSearch({
                cityName:          dest.city,
                countryCode:       dest.countryCode,
                checkin,
                checkout,
                adults:            2,
                guest_nationality: 'KR',
            }) as any;

            const hotels: any[] = Array.isArray(result?.data) ? result.data : [];

            if (!hotels.length) {
                console.log(`[sync-hotel-deals] No results for ${dest.city} — skipping`);
                skipped.push(dest.city);
                continue;
            }

            // Pick the single best deal for this city
            const best = hotels
                .filter((h: any) => h.price > 0 && h.name)
                .sort((a: any, b: any) => dealScore(b) - dealScore(a))[0];

            if (!best) {
                skipped.push(dest.city);
                continue;
            }

            const salePrice     = Math.round(Number(best.price));
            const originalPrice = Math.round(salePrice * 1.25); // 25% "was" markup
            const location      = [best.city || dest.city, best.country || dest.countryCode]
                .filter(Boolean).join(', ');

            await sql`
                INSERT INTO weekend_flight_deals
                    (name, location, rating, reviews, original_price, sale_price,
                     currency, image_url, badge, updated_at)
                VALUES (
                    ${best.name},
                    ${location},
                    ${Number((best.reviewRating ?? 0).toFixed(1))},
                    ${best.reviews ?? 0},
                    ${originalPrice},
                    ${salePrice},
                    ${'USD'},
                    ${best.image || null},
                    ${pickBadge(best)},
                    ${now}
                )
                ON CONFLICT (name, location) DO UPDATE SET
                    rating         = EXCLUDED.rating,
                    reviews        = EXCLUDED.reviews,
                    original_price = EXCLUDED.original_price,
                    sale_price     = EXCLUDED.sale_price,
                    currency       = EXCLUDED.currency,
                    image_url      = COALESCE(EXCLUDED.image_url, weekend_flight_deals.image_url),
                    badge          = EXCLUDED.badge,
                    updated_at     = EXCLUDED.updated_at
            `;

            console.log(`[sync-hotel-deals] ✓ ${dest.city}: "${best.name}" $${salePrice}/night (score ${dealScore(best).toFixed(2)})`);
            upserted.push(`${dest.city}: ${best.name} @ $${salePrice}`);

        } catch (err: any) {
            console.error(`[sync-hotel-deals] ✗ ${dest.city}:`, err.message);
            errors.push(`${dest.city}: ${err.message}`);
        }
    }

    console.log(`[sync-hotel-deals] Done — upserted: ${upserted.length}, skipped: ${skipped.length}, errors: ${errors.length}`);

    return NextResponse.json({
        success: true,
        checkin,
        checkout,
        upserted: upserted.length,
        skipped:  skipped.length,
        errors:   errors.length,
        deals:    upserted,
        ...(errors.length ? { error_details: errors } : {}),
    });
}
