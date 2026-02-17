import { searchAirports } from '@/lib/airports';
import { NextRequest } from 'next/server';

/**
 * GET /api/airports/search?q=tokyo&limit=8
 * 
 * Searches local airport dataset. Returns matching airports
 * sorted by relevance (exact IATA > prefix > city > name).
 */
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = req.nextUrl;
        const query = searchParams.get('q') || '';
        const limit = Math.min(parseInt(searchParams.get('limit') || '8', 10), 20);

        if (!query || query.length < 1) {
            return Response.json({ success: true, data: [] });
        }

        const results = searchAirports(query, limit);
        return Response.json({ success: true, data: results });
    } catch (err) {
        console.error('[airports/search] Error:', err);
        return Response.json(
            { success: false, error: String(err) },
            { status: 500 }
        );
    }
}
