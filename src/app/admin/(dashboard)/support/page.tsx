import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { canAdminister } from '@/lib/auth/roles';
import { inboxCounts, listInbox } from '@/lib/server/support/inbox';
import { SupportInboxClient } from './SupportInboxClient';
import type { InboxConversation } from './types';

export const dynamic = 'force-dynamic';

/**
 * The support inbox.
 *
 * Opens on the work queue. The layout above already refuses anyone who is not an admin;
 * the session is read again here because this page needs the Agent's own id to know what
 * "mine" means, not because it distrusts the layout.
 */
export default async function AdminSupportPage() {
    const { user } = await getSession();
    // Admins only: a Support Agent reaches the same inbox through /admin/desk, and the
    // layout above already sends them there.
    if (!user || !canAdminister(user.role)) redirect('/');

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
