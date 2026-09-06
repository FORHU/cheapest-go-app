import { NextResponse } from 'next/server';
import { requireAgent } from '@/lib/server/support/admin-auth';
import { inboxCounts } from '@/lib/server/support/inbox';

export const dynamic = 'force-dynamic';

/**
 * Just the numbers, for the sidebar badge.
 *
 * Separate from the conversations route because the badge renders on every admin page and
 * polls: it wants two integers, not a page of rows it will throw away.
 */
export async function GET() {
    const agent = await requireAgent();
    if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    return NextResponse.json(await inboxCounts(agent.id));
}
