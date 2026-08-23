/**
 * POST /api/internal/issue-ticket
 *
 * HTTP wrapper around `issueTicket()` in `src/lib/server/flights/issue-ticket.ts`, which is
 * where the logic now lives. Callers inside this process import that function directly
 * rather than making a loopback request — see ADR-0012.
 *
 * Kept because the endpoint is part of the surface inherited from the Supabase Edge
 * Function `functions/v1/issue-ticket`.
 *
 * Auth: Authorization: Bearer <FUNCTIONS_SECRET>
 *
 * Request body: { bookingId: string }
 * Response:     { success: true, ticketStatus: string }
 *             | { success: false, error: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { issueTicket } from '@/lib/server/flights/issue-ticket';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function checkAuth(req: NextRequest): boolean {
    const secret = process.env.FUNCTIONS_SECRET;
    if (!secret) {
        console.warn('[issue-ticket] FUNCTIONS_SECRET not set — allowing request (dev mode)');
        return true;
    }
    const authHeader = req.headers.get('authorization') ?? '';
    return authHeader === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
    if (!checkAuth(req)) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    let body: { bookingId?: string };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    const { httpStatus, ...payload } = await issueTicket(body.bookingId ?? '');
    return NextResponse.json(payload, httpStatus && httpStatus !== 200 ? { status: httpStatus } : undefined);
}
