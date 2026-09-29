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

    // An admin's work is handing out the Unassigned queue, so that is where this opens.
    const [conversations, counts] = await Promise.all([
        listInbox({ filter: 'unassigned', adminId: user.id }),
        inboxCounts({ id: user.id, role: 'admin' }),
    ]);

    return (
        <SupportInboxClient
            initialFilter="unassigned"
            initialConversations={conversations as unknown as InboxConversation[]}
            initialCounts={counts}
            currentAdminId={user.id}
            currentRole="admin"
        />
    );
}
