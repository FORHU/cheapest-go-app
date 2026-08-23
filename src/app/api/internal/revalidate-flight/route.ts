/**
 * POST /api/internal/revalidate-flight
 *
 * HTTP wrapper around `revalidateFlight()` in `src/lib/server/flights/revalidate-flight.ts`,
 * which is where the logic now lives. Callers inside this process import that function
 * directly rather than making a loopback request to this route — see ADR-0012.
 *
 * Kept because the endpoint is part of the surface inherited from the Supabase Edge
 * Function `functions/v1/revalidate-flight`, and removing it would break anything still
 * calling it over HTTP.
 *
 * Auth: Authorization: Bearer <FUNCTIONS_SECRET>
 *
 * Request body: { userId: string, provider: string, flightPayload: FlightOffer & { oldPrice?: number } }
 * Response:
 *   { success: true, seatsAvailable: true, priceChanged: false }
 *   { success: true, seatsAvailable: true, priceChanged: true, newPrice: number }
 *   { success: false, seatsAvailable: false, error: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { revalidateFlight } from '@/lib/server/flights/revalidate-flight';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function checkAuth(req: NextRequest): boolean {
    const secret = process.env.FUNCTIONS_SECRET;
    if (!secret) {
        console.warn('[revalidate-flight] FUNCTIONS_SECRET not set — allowing request (dev mode)');
        return true;
    }
    const authHeader = req.headers.get('authorization') ?? '';
    return authHeader === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
    if (!checkAuth(req)) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    let body: { userId?: string; provider?: string; flightPayload?: any };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    const result = await revalidateFlight(body);

    // A bad request is the only non-200 outcome. "Sold out" and "price changed" are
    // successful answers to the question asked, and always were.
    const { badRequest, ...payload } = result;
    return NextResponse.json(payload, badRequest ? { status: 400 } : undefined);
}
