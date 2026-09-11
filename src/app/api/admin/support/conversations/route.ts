import { NextRequest, NextResponse } from 'next/server';
import { requireAgent } from '@/lib/server/support/admin-auth';
import { inboxCounts, listInbox, type InboxFilter } from '@/lib/server/support/inbox';

export const dynamic = 'force-dynamic';

const FILTERS = new Set<InboxFilter>(['unassigned', 'mine', 'assigned', 'assistant', 'resolved']);

/**
 * One view of the inbox, plus the counts the tabs and the sidebar badge show.
 *
 * Every Agent may read every view — a Support Agent reads the Unassigned queue and colleagues'
 * chats; they just cannot write in them (ADR-0041). The default view is where each role's
 * work is: Unassigned for an admin, Mine for a Support Agent.
 */
export async function GET(req: NextRequest) {
    const agent = await requireAgent();
    if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const fallback: InboxFilter = agent.role === 'admin' ? 'unassigned' : 'mine';
    const requested = req.nextUrl.searchParams.get('filter') ?? fallback;
    const filter = FILTERS.has(requested as InboxFilter) ? (requested as InboxFilter) : fallback;

    const [conversations, counts] = await Promise.all([
        listInbox({ filter, adminId: agent.id }),
        inboxCounts(agent),
    ]);

    return NextResponse.json({ filter, conversations, counts });
}
