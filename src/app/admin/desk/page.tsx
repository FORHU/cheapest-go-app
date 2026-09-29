import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { canStaffSupport } from '@/lib/auth/roles';
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
    if (!user || !canStaffSupport(user.role)) redirect('/');

    // Where each role's work is: an admin hands out Unassigned chats, a Support Agent works
    // the ones given to them (ADR-0041).
    const role = user.role === 'admin' ? 'admin' : 'support_agent';
    const initialFilter = role === 'admin' ? 'unassigned' : 'mine';

    const [conversations, counts] = await Promise.all([
        listInbox({ filter: initialFilter, adminId: user.id }),
        inboxCounts({ id: user.id, role }),
    ]);

    return (
        <SupportInboxClient
            initialFilter={initialFilter}
            initialConversations={conversations as unknown as InboxConversation[]}
            initialCounts={counts}
            currentAdminId={user.id}
            currentRole={role}
        />
    );
}
