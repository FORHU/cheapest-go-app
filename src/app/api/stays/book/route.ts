import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/server/auth';
import { rateLimit } from '@/lib/server/rate-limit';

const DUFFEL_API = 'https://api.duffel.com';

async function duffelFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = process.env.DUFFEL_ACCESS_TOKEN;
    if (!token) throw new Error('DUFFEL_ACCESS_TOKEN not set');

    const res = await fetch(`${DUFFEL_API}${path}`, {
        ...init,
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
}

/**
 * POST /api/stays/book
 * Body: {
 *   quote_id: string,
 *   guests: { given_name: string; family_name: string; born_on: string; email: string; phone_number: string }[],
 *   payment: { type: 'balance' }
 * }
 */
export async function POST(req: NextRequest) {
    const rl = rateLimit(req, { limit: 5, windowMs: 60_000, prefix: 'stays-book' });
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    const { user, error: authError } = await getAuthenticatedUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let body: { quote_id?: string; guests?: unknown[]; payment?: unknown };
    try { body = await req.json(); } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { quote_id, guests, payment } = body;
    if (!quote_id || !guests || !payment) {
        return NextResponse.json({ error: 'quote_id, guests, and payment are required' }, { status: 400 });
    }

    try {
        const booking = await duffelFetch('/stays/bookings', {
            method: 'POST',
            body: JSON.stringify({
                data: { quote_id, guests, payment },
            }),
        });
        return NextResponse.json(booking);
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Booking failed';
        console.error('[stays/book]', msg);
        return NextResponse.json({ error: msg }, { status: 502 });
    }
}
