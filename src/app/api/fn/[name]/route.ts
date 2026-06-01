/**
 * Edge Function bridge — /api/fn/[name]
 *
 * During migration, Edge Functions still live in supabase/functions/ as Deno code.
 * This route acts as a proxy: it forwards requests to the self-hosted function
 * server (FUNCTIONS_BASE_URL) or returns a 501 if no server is configured.
 *
 * Migration path for each function:
 *   1. Create src/app/api/fn/{name}/route.ts with the Node.js equivalent
 *   2. Delete the supabase/functions/{name} directory
 *   3. The dynamic [name] catch-all is only a fallback for unconverted functions
 *
 * Functions already converted to dedicated API routes will shadow this handler
 * because Next.js uses the most specific matching route.
 */

import { NextRequest, NextResponse } from 'next/server';

const FUNCTIONS_BASE_URL = process.env.FUNCTIONS_BASE_URL;
// Legacy Supabase URL for functions not yet migrated
const SUPABASE_FUNCTIONS_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`
    : null;

const FUNCTIONS_SECRET =
    process.env.FUNCTIONS_SECRET ||
    process.env.INTERNAL_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ name: string }> }
) {
    const { name } = await params;

    // Try self-hosted function server first
    const targetBase = FUNCTIONS_BASE_URL || SUPABASE_FUNCTIONS_URL;
    if (!targetBase) {
        return NextResponse.json(
            { error: `Function "${name}" has not been migrated to an API route yet. Set FUNCTIONS_BASE_URL or create src/app/api/fn/${name}/route.ts` },
            { status: 501 }
        );
    }

    const targetUrl = `${targetBase}/${name}`;
    const body = await req.text();

    try {
        const upstream = await fetch(targetUrl, {
            method: 'POST',
            headers: {
                'Content-Type': req.headers.get('content-type') || 'application/json',
                'Authorization': `Bearer ${FUNCTIONS_SECRET}`,
                'apikey': FUNCTIONS_SECRET || '',
            },
            body,
        });

        const contentType = upstream.headers.get('content-type') || '';
        const responseBody = await upstream.text();

        return new NextResponse(responseBody, {
            status: upstream.status,
            headers: { 'Content-Type': contentType },
        });
    } catch (err: any) {
        console.error(`[api/fn/${name}] Proxy error:`, err.message);
        return NextResponse.json(
            { error: `Failed to invoke function "${name}": ${err.message}` },
            { status: 502 }
        );
    }
}

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ name: string }> }
) {
    return POST(req, { params });
}
