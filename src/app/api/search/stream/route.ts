import { NextRequest } from 'next/server';
import { runTgxSearch } from '@/lib/server/stays/travelgatex/search';
import { searchDuffelStays } from '@/lib/server/stays/providers/duffel';

export const dynamic = 'force-dynamic';
export const maxDuration = 55;

/**
 * POST /api/search/stream
 *
 * MapResultsClient reads this as NDJSON and expects:
 *   { "type": "hotels", "data": [...], "allMappable": [...], "totalCount": N }
 *   { "type": "done", "totalCount": N }
 *
 * On error or empty results:
 *   { "type": "error", "message": "..." }
 *
 * Falls back to Duffel Stays when TGX/OTV has no catalog coverage for a city.
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const result = await runTgxSearch(body) as any;

        let hotels: any[] = Array.isArray(result.data) ? result.data : [];
        let allMappable: any[] = result.allMappable ?? [];

        // Duffel fallback: TGX/OTV doesn't cover all cities (e.g. Bangkok)
        if (hotels.length === 0 && !body.hotelCode) {
            const cityName: string = body.cityName ?? body.destination ?? '';
            if (cityName) {
                console.log(`[search/stream] TGX empty for "${cityName}" — trying Duffel`);
                const duffelResults = await searchDuffelStays({
                    checkin:           body.checkin  ?? body.checkIn  ?? '',
                    checkout:          body.checkout ?? body.checkOut ?? '',
                    adults:            Number(body.adults)   || 2,
                    children:          Number(body.children) || 0,
                    rooms:             Number(body.rooms)    || 1,
                    guest_nationality: body.guest_nationality ?? 'KR',
                    currency:          body.currency ?? 'KRW',
                    cityName,
                    countryCode:       body.countryCode ?? '',
                    query:             cityName,
                });

                // Flatten Duffel Property to the same top-level shape TGX hotels use,
                // so MapResultsClient can render them without changes.
                hotels = duffelResults.map(p => ({
                    hotelId:      p.id,
                    id:           p.id,
                    name:         p.name,
                    price:        p.price,
                    currency:     p.currency,
                    lat:          (p as any).coordinates?.lat ?? 0,
                    lng:          (p as any).coordinates?.lng ?? 0,
                    images:       (p as any).images ?? [],
                    starRating:   p.rating ? Math.round(p.rating / 2) : 0,
                    reviewRating: p.rating ?? 0,
                    reviewCount:  p.reviews ?? 0,
                    description:  p.description ?? '',
                    address:      p.location ?? '',
                    city:         p.city ?? cityName,
                    country:      body.countryCode ?? '',
                    amenities:    (p as any).amenities ?? [],
                    refundableTag: (p as any).refundableTag ?? 'UNKNOWN',
                    boardCode:    (p as any).boardTypes?.[0] ?? 'RO',
                    provider:     'duffel',
                    rateId:       (p as any).rateId,
                    roomTypes:    [],
                }));
                allMappable = hotels.filter(h => h.lat && h.lng);
                console.log(`[search/stream] Duffel fallback: ${hotels.length} results for "${cityName}"`);
            }
        }

        const totalCount = hotels.length;

        const hotelsChunk = JSON.stringify({
            type:        'hotels',
            data:        hotels,
            allMappable,
            totalCount,
        });
        const doneChunk = JSON.stringify({
            type:       'done',
            totalCount,
            allMappable,
        });

        const ndjson = hotelsChunk + '\n' + doneChunk + '\n';

        return new Response(ndjson, {
            headers: { 'Content-Type': 'application/x-ndjson' },
        });
    } catch (e: any) {
        console.error('[search/stream] Error:', e.message);
        const errorChunk = JSON.stringify({ type: 'error', message: e.message });
        return new Response(errorChunk + '\n', {
            status: 200, // keep 200 so the client reads the body
            headers: { 'Content-Type': 'application/x-ndjson' },
        });
    }
}
