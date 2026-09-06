import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { inboxCounts, listInbox } from '@/lib/server/support/inbox';
import { SupportInboxClient } from '../(dashboard)/support/SupportInboxClient';
import type { InboxConversation } from '../(dashboard)/support/types';

export const dynamic = 'force-dynamic';

/**
 * The desk's inbox — the same component the full admin uses.
 *
 * Shared rather than copied: two inboxes would drift, and the one an Agent uses less often
 * is the one that would rot.
 */
export default async function DeskInboxPage() {
    const { user } = await getSession();
    if (!user || user.role !== 'admin') redirect('/');

    const [conversations, counts] = await Promise.all([
        listInbox({ filter: 'waiting', adminId: user.id }),
        inboxCounts(user.id),
    ]);

    return (
        <SupportInboxClient
            initialFilter="waiting"
            initialConversations={conversations as unknown as InboxConversation[]}
            initialCounts={counts}
        />
    );
}
