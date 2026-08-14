import { NextRequest, NextResponse } from 'next/server';
import { getSqlAdmin } from '@/lib/db/postgres';

export const dynamic    = 'force-dynamic';
export const maxDuration = 300;

/**
 * GET /api/cron/geocode-hotels?batch=50
 *
 * Geocodes hotels with a null osm_geocoded_at using the free Nominatim API
 * (OpenStreetMap). Updates hotel_content.lat + lng with precise coordinates.
 * Safe to restart — already-processed hotels are skipped via osm_geocoded_at.
 */
export async function GET(req: NextRequest) {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const batch  = Math.min(parseInt(req.nextUrl.searchParams.get('batch') ?? '50', 10), 200);
    const offset = parseInt(req.nextUrl.searchParams.get('offset') ?? '0', 10);

    const sql = getSqlAdmin();

    const hotels = await sql<{ hotel_id: string; address: string | null; city: string | null; country: string | null }[]>`
        SELECT hotel_id, address, city, country
        FROM hotel_content
        WHERE address IS NOT NULL
          AND osm_geocoded_at IS NULL
        ORDER BY hotel_id
        LIMIT ${batch}
        OFFSET ${offset}
    `;

    if (!hotels.length) {
        const [{ remaining }] = await sql<{ remaining: string }[]>`
            SELECT COUNT(*) AS remaining FROM hotel_content
            WHERE address IS NOT NULL AND osm_geocoded_at IS NULL
        `;
        return NextResponse.json({ updated: 0, failed: 0, remaining: parseInt(remaining, 10), processed: 0, message: 'Nothing to geocode' });
    }

    let updated = 0;
    let failed  = 0;

    for (const hotel of hotels) {
        const query = [hotel.address, hotel.city, hotel.country].filter(Boolean).join(', ');
        try {
            const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
            const res  = await fetch(url, {
                headers: { 'User-Agent': 'CheapestGo/1.0 (support@cheapestgo.com)' },
                signal:  AbortSignal.timeout(8000),
            });
            const data = await res.json() as { lat: string; lon: string }[];

            if (data.length && data[0].lat && data[0].lon) {
                await sql`
                    UPDATE hotel_content
                    SET lat = ${parseFloat(data[0].lat)},
                        lng = ${parseFloat(data[0].lon)},
                        osm_geocoded_at = NOW()
                    WHERE hotel_id = ${hotel.hotel_id}
                `;
                updated++;
            } else {
                await sql`
                    UPDATE hotel_content SET osm_geocoded_at = NOW()
                    WHERE hotel_id = ${hotel.hotel_id}
                `;
                failed++;
            }
        } catch {
            // network error — leave osm_geocoded_at null so it retries next run
            failed++;
        }

        await new Promise(r => setTimeout(r, 1100));
    }

    const [{ remaining }] = await sql<{ remaining: string }[]>`
        SELECT COUNT(*) AS remaining FROM hotel_content
        WHERE address IS NOT NULL AND osm_geocoded_at IS NULL
    `;

    return NextResponse.json({
        updated,
        failed,
        remaining: parseInt(remaining, 10),
        processed: hotels.length,
    });
}
