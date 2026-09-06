import { NextRequest, NextResponse } from 'next/server';
import { requireAgent } from '@/lib/server/support/admin-auth';
import { inboxCounts, listInbox, type InboxFilter } from '@/lib/server/support/inbox';

export const dynamic = 'force-dynamic';

const FILTERS = new Set<InboxFilter>(['waiting', 'mine', 'assistant', 'resolved']);

/** One view of the inbox, plus the counts the tabs and the sidebar badge show. */
export async function GET(req: NextRequest) {
    const agent = await requireAgent();
    if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const requested = req.nextUrl.searchParams.get('filter') ?? 'waiting';
    const filter = FILTERS.has(requested as InboxFilter)
        ? (requested as InboxFilter)
        : 'waiting';

    const [conversations, counts] = await Promise.all([
        listInbox({ filter, adminId: agent.id }),
        inboxCounts(agent.id),
    ]);

    return NextResponse.json({ filter, conversations, counts });
}
