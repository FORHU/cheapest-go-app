/**
 * POST /api/internal/create-booking
 *
 * HTTP wrapper around `createBooking()` in `src/lib/server/flights/create-booking.ts`,
 * which is where the logic now lives. Callers inside this process import that function
 * directly rather than making a loopback request — see ADR-0012.
 *
 * Kept because the endpoint is part of the surface inherited from the Supabase Edge
 * Function `functions/v1/create-booking`.
 *
 * Auth: Authorization: Bearer <FUNCTIONS_SECRET>
 *
 * Request body: { sessionId: string, paymentIntentId?: string }
 * Response:     { success: true, bookingId, pnr, status, confirmedPrice, confirmedCurrency }
 *             | { success: false, alreadyBooked?: true }
 *             | { success: false, error: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createBooking } from '@/lib/server/flights/create-booking';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function checkAuth(req: NextRequest): boolean {
    const secret = process.env.FUNCTIONS_SECRET;
    if (!secret) {
        console.warn('[create-booking] FUNCTIONS_SECRET not set — allowing request (dev mode)');
        return true;
    }
    const authHeader = req.headers.get('authorization') ?? '';
    return authHeader === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
    if (!checkAuth(req)) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    let body: { sessionId?: string; paymentIntentId?: string };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    const { httpStatus, ...payload } = await createBooking(body);
    return NextResponse.json(payload, httpStatus && httpStatus !== 200 ? { status: httpStatus } : undefined);
}
