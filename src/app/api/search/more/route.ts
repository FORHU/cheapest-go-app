/**
 * /api/search/more — proxy for paginated "Load More" hotel search.
 * Client-side SearchResults calls this endpoint; it forwards the request
 * to the Supabase edge function (which uses rawCache to skip TGX search).
 */
import { NextRequest, NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!;

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();

        const res = await fetch(`${supabaseUrl}/functions/v1/travelgatex-search`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseKey}`,
                'apikey': supabaseKey,
            },
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            const err = await res.text().catch(() => 'Unknown error');
            return NextResponse.json({ error: err }, { status: res.status });
        }

        const data = await res.json();
        return NextResponse.json(data);
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
