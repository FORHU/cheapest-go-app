import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/server/rate-limit';
import { env } from '@/utils/env';

const DUFFEL_API = 'https://api.duffel.com';
const DUFFEL_TIMEOUT_MS = 15_000;

async function duffelFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = env.DUFFEL_TOKEN;
    if (!token) throw new Error('DUFFEL_ACCESS_TOKEN not set');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DUFFEL_TIMEOUT_MS);

    try {
        const res = await fetch(`${DUFFEL_API}${path}`, {
            ...init,
            signal: controller.signal,
            headers: {
                Authorization: `Bearer ${token}`,
                'Duffel-Version': 'v2',
                'Content-Type': 'application/json',
                Accept: 'application/json',
                ...(init.headers ?? {}),
            },
        });

        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Duffel ${path} → ${res.status}: ${text.slice(0, 300)}`);
        }
        return res.json() as Promise<T>;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * POST /api/stays/quote
 * Body: { rate_id: string }
 * Creates a Duffel Stays quote and returns full accommodation + pricing details.
 */
export async function POST(req: NextRequest) {
    const rl = await rateLimit(req, { limit: 20, windowMs: 60_000, prefix: 'stays-quote' });
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    let body: { rate_id?: string };
    try { body = await req.json(); } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { rate_id } = body;
    if (!rate_id || typeof rate_id !== 'string') {
        return NextResponse.json({ error: 'rate_id is required' }, { status: 400 });
    }

    try {
        const quote = await duffelFetch('/stays/quotes', {
            method: 'POST',
            body: JSON.stringify({ data: { rate_id } }),
        });
        return NextResponse.json(quote);
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Quote failed';
        console.error('[stays/quote]', msg);
        const status = msg.includes('aborted') ? 504 : 502;
        return NextResponse.json({ error: msg }, { status });
    }
}
