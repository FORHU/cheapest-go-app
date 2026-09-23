/**
 * POST /api/auth/presence
 *
 * Records Presence for the caller's session — a click, keypress, scroll or touch, per the
 * Idle Limit (CONTEXT.md, ADR-0027). Only `useIdlePresence` is meant to call this, throttled
 * and only in response to real activity; a route wired into routine polling would defeat
 * the limit it exists to enforce.
 *
 * `getSession()` runs first and judges the request against the session's *existing*
 * `last_active_at` — the one from before this call — so a session already past its limit is
 * invalidated and refused here rather than revived by the very ping meant to save it.
 */

import { NextResponse } from 'next/server';
import { getSession, touchSessionPresence } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export async function POST() {
    const { session } = await getSession();
    if (!session) {
        return NextResponse.json({ error: 'No active session.' }, { status: 401 });
    }

    await touchSessionPresence(session.id);
    return NextResponse.json({ success: true });
}
