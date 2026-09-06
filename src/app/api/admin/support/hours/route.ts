import { NextResponse } from 'next/server';
import { requireAgent } from '@/lib/server/support/admin-auth';
import { getSupportHours, saveSupportHours } from '@/lib/server/support/availability';

export const dynamic = 'force-dynamic';

/** The current schedule, for the desk's settings form. */
export async function GET() {
    const agent = await requireAgent();
    if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    return NextResponse.json({ hours: await getSupportHours() });
}

/**
 * Replace the schedule.
 *
 * A whole schedule rather than a patch: partial updates to a week invite the state where
 * half of it is what you meant and half is what was there before, with no way to tell.
 */
export async function PUT(req: Request) {
    const agent = await requireAgent();
    if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const result = await saveSupportHours((body as { hours?: unknown })?.hours);
    if (!result.ok) {
        // The message names the day and the problem, so the form can show it in place.
        return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ hours: result.hours });
}
