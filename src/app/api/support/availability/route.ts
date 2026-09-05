import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/server/rate-limit';
import { getSupportAvailability } from '@/lib/server/support/availability';
import { nextOpening } from '@/lib/server/support/hours';

export const dynamic = 'force-dynamic';

/**
 * Whether a human can be reached right now, and the published hours.
 *
 * Public and unauthenticated — it says nothing about any conversation, only when the desk
 * is open, which is the same answer for everyone. The widget reads it to decide whether to
 * offer the escalation button; `POST /escalate` re-checks it, because this answer can be
 * stale by the time the customer presses anything.
 */
export async function GET(req: NextRequest) {
    const rl = await rateLimit(req, { limit: 60, windowMs: 60_000, prefix: 'support-availability' });
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    const { humanAvailable, hours } = await getSupportAvailability();
    // Carried whether open or shut: the widget needs it to say when someone will pick up
    // a conversation escalated overnight.
    return NextResponse.json({ humanAvailable, hours, nextOpening: nextOpening(hours, new Date()) });
}
