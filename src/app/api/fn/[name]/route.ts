/**
 * Edge Function bridge — /api/fn/[name]
 *
 * Fallback proxy for any function not yet implemented as a dedicated API route.
 * Set FUNCTIONS_BASE_URL to point at a self-hosted function server (e.g. Deno Deploy).
 * Without it, returns 501.
 *
 * Functions with a dedicated src/app/api/fn/{name}/route.ts shadow this handler
 * automatically — Next.js uses the most specific matching route.
 */

import { NextRequest, NextResponse } from 'next/server';

const FUNCTIONS_BASE_URL = process.env.FUNCTIONS_BASE_URL;
const FUNCTIONS_SECRET = process.env.FUNCTIONS_SECRET || process.env.INTERNAL_SECRET;

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ name: string }> }
) {
    const { name } = await params;

    if (!FUNCTIONS_BASE_URL) {
        return NextResponse.json(
            { error: `Function "${name}" has not been migrated to an API route yet. Set FUNCTIONS_BASE_URL or create src/app/api/fn/${name}/route.ts` },
            { status: 501 }
        );
    }

    const targetUrl = `${FUNCTIONS_BASE_URL}/${name}`;
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
