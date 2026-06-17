/**
 * POST /api/fn/travelgatex-destinations
 * Destination autocomplete — replaces the Supabase Edge Function.
 */

import { NextRequest, NextResponse } from 'next/server';
import { tgxGraphQL, getTgxConfig } from '@/lib/server/stays/travelgatex/client';

export const dynamic = 'force-dynamic';

const QUERY = `
query TgxDestinations($access: ID!, $text: String!, $maxSize: Int) {
  hotelX {
    destinationSearcher(criteria: { access: $access, text: $text, maxSize: $maxSize }) {
      ... on DestinationData {
        code
        type
        texts { text language }
      }
    }
  }
}`;

function checkAuth(req: NextRequest): boolean {
    const secret = process.env.FUNCTIONS_SECRET || process.env.INTERNAL_SECRET;
    if (!secret) return true;
    return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
    if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    try {
        const { keyword } = await req.json();
        if (!keyword?.trim()) return NextResponse.json({ data: [] });

        const cfg = getTgxConfig();
        const result = await tgxGraphQL(QUERY, {
            access:  cfg.accessCode,
            text:    keyword.trim(),
            maxSize: 50,
        });

        const items = result?.data?.hotelX?.destinationSearcher || [];

        const data = items
            .filter((d: any) => d.code)
            .map((d: any) => ({
                code:  d.code,
                type:  d.type,
                label: d.texts?.find((t: any) => t.language === 'en')?.text
                    || d.texts?.[0]?.text
                    || d.code,
            }));

        return NextResponse.json({ data });
    } catch (err: any) {
        console.error('[travelgatex-destinations] Error:', err.message);
        return NextResponse.json({ error: err.message, data: [] }, { status: 502 });
    }
}
