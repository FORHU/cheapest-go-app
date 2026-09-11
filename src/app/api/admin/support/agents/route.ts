import { NextResponse } from 'next/server';
import { requireAgent } from '@/lib/server/support/admin-auth';
import { handledTally, listAssignableAgents } from '@/lib/server/support/assignment';

export const dynamic = 'force-dynamic';

/**
 * Admins only: who a chat can be given to, and what each person holds and has handled this
 * month — the tally pay is worked out from (CONTEXT.md, "Handled").
 *
 * The month is the calendar month in UTC, the same clock the resolutions are recorded on.
 */
export async function GET() {
    const agent = await requireAgent();
    if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (agent.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const [agents, tally] = await Promise.all([listAssignableAgents(), handledTally(monthStart)]);
    return NextResponse.json({ agents, tally, since: monthStart.toISOString() });
}
