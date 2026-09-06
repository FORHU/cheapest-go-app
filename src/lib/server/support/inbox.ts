import { getSqlAdmin } from '@/lib/db/postgres';
import { appendMessage, type SupportMessage } from './messages';

/**
 * The Agent's side of a Support Chat: what is waiting, and answering it.
 *
 * Ownership is taken by answering rather than by a separate Claim step — the first reply
 * writes `assigned_admin_id` and the conversation leaves the unassigned queue. There is no
 * claim to go stale when someone opens a conversation and walks away.
 */

export type InboxFilter = 'waiting' | 'mine' | 'assistant' | 'resolved';

export interface InboxRow {
    id: string;
    status: string;
    sourceBrand: string | null;
    locale: string;
    guestName: string | null;
    guestEmail: string | null;
    userId: string | null;
    assignedAdminId: string | null;
    escalationReason: string | null;
    lastMessageAt: string;
    createdAt: string;
}

const ROW_COLUMNS = `
    c.id,
    c.status,
    c.source_brand       AS "sourceBrand",
    c.locale,
    c.guest_name         AS "guestName",
    c.guest_email        AS "guestEmail",
    c.user_id            AS "userId",
    c.assigned_admin_id  AS "assignedAdminId",
    c.escalation_reason  AS "escalationReason",
    c.last_message_at    AS "lastMessageAt",
    c.created_at         AS "createdAt"
`;

/** Most rows returned in one view, so a long history cannot become an unbounded page. */
export const INBOX_PAGE_SIZE = 100;

export interface ListInboxInput {
    filter: InboxFilter;
    /** Required for the 'mine' filter; ignored otherwise. */
    adminId?: string;
}

/**
 * The conversations in one view of the inbox.
 *
 * Never filtered by brand. Every other admin screen follows the brand switcher, and this
 * one deliberately does not: a GeomeeGo customer waiting would be invisible on the
 * CheapestGo admin, and nobody would learn the conversation existed. See ADR-0030.
 *
 * `waiting` is oldest-first because the longest wait is the most urgent; everything else
 * is newest-first, which is how you read a list you are browsing rather than working.
 */
export async function listInbox({ filter, adminId }: ListInboxInput): Promise<InboxRow[]> {
    const sql = getSqlAdmin();

    const where = {
        waiting: `c.status = 'waiting_human'`,
        mine: `c.assigned_admin_id = $1 AND c.status <> 'resolved'`,
        assistant: `c.status = 'ai_active'`,
        resolved: `c.status = 'resolved'`,
    }[filter];

    const order = filter === 'waiting' ? 'c.last_message_at ASC' : 'c.last_message_at DESC';
    const params = filter === 'mine' ? [adminId ?? null] : [];

    const rows = await sql.unsafe<InboxRow[]>(
        `SELECT ${ROW_COLUMNS}
           FROM support_conversations c
          WHERE ${where}
          ORDER BY ${order}
          LIMIT ${INBOX_PAGE_SIZE}`,
        params,
    );
    return rows;
}

export interface InboxCounts {
    waiting: number;
    mine: number;
}

/**
 * What the sidebar badge shows.
 *
 * `waiting` spans both brands for the same reason the list does — a count that hides a
 * brand is worse than no count, because it looks authoritative.
 */
export async function inboxCounts(adminId: string): Promise<InboxCounts> {
    const sql = getSqlAdmin();
    const rows = await sql<{ waiting: string; mine: string }[]>`
        SELECT
            count(*) FILTER (WHERE status = 'waiting_human') AS waiting,
            count(*) FILTER (WHERE assigned_admin_id = ${adminId} AND status <> 'resolved') AS mine
          FROM support_conversations
    `;
    return {
        waiting: Number(rows[0]?.waiting ?? 0),
        mine: Number(rows[0]?.mine ?? 0),
    };
}

export interface AgentConversationDetail {
    conversation: InboxRow;
    messages: SupportMessage[];
    /**
     * The customer's bookings, or null when there is nobody proven to ask about.
     *
     * Null for a guest however convincing their email looks. An Agent may still look
     * someone up in the bookings screen — ADR-0029 is explicit that a person weighing a
     * claim is a different thing from a system acting on an unverified string. What must
     * not happen is a stranger's trips appearing on screen because they typed an address.
     */
    bookings: unknown[] | null;
}

/** One conversation, with everything an Agent needs to answer it without leaving. */
export async function getConversationForAgent(
    conversationId: string,
): Promise<AgentConversationDetail | null> {
    const sql = getSqlAdmin();
    const rows = await sql.unsafe<InboxRow[]>(
        `SELECT ${ROW_COLUMNS} FROM support_conversations c WHERE c.id = $1`,
        [conversationId],
    );

    const conversation = rows[0];
    if (!conversation) return null;

    const { listMessages } = await import('./messages');
    const messages = await listMessages(conversationId);

    let bookings: unknown[] | null = null;
    if (conversation.userId) {
        try {
            const [{ getUserBookings }, { createAdminClient }] = await Promise.all([
                import('@/lib/server/bookings'),
                import('@/utils/postgres/admin'),
            ]);
            const result = await getUserBookings(
                { id: conversation.userId } as Parameters<typeof getUserBookings>[0],
                createAdminClient(),
            );
            const data = (result as { data?: unknown }).data;
            bookings = Array.isArray(data) ? data : [];
        } catch (err) {
            // A conversation an Agent cannot open is worse than one missing a side panel.
            console.error('[support/inbox] booking lookup failed:', err);
            bookings = [];
        }
    }

    return { conversation, messages, bookings };
}

export interface AgentReplyInput {
    conversationId: string;
    adminId: string;
    body: string;
}

/**
 * Answer a customer, taking ownership if nobody has yet.
 *
 * The assignment is a conditional UPDATE rather than a read-then-write: two Agents opening
 * the queue on a Monday morning and replying at the same instant is the case this exists
 * for, and only Postgres can settle it. The second reply is still delivered — the customer
 * should not lose a message because of who typed first — but ownership does not move.
 */
export async function agentReply(input: AgentReplyInput): Promise<SupportMessage> {
    const sql = getSqlAdmin();

    // Assign first: if the message write fails, an unanswered conversation with an owner
    // is a smaller problem than an answered one nobody is accountable for.
    await sql`
        UPDATE support_conversations
           SET assigned_admin_id = ${input.adminId},
               status = 'human_active'
         WHERE id = ${input.conversationId}
           AND assigned_admin_id IS NULL
    `;

    // Already owned by someone else — still deliver, still move it out of the queue.
    await sql`
        UPDATE support_conversations
           SET status = 'human_active'
         WHERE id = ${input.conversationId}
           AND status = 'waiting_human'
    `;

    return appendMessage({
        conversationId: input.conversationId,
        senderType: 'agent',
        senderAdminId: input.adminId,
        body: input.body,
    });
}

/**
 * Mark a Support Chat finished.
 *
 * Not an ending: a customer who writes again reopens it with the same transcript. This
 * records what the Agent believed, not what the customer agreed.
 */
/**
 * Hand a finished conversation back to the assistant when the customer writes again.
 *
 * Resolved is not an ending. Someone returning days later usually has a new question, so
 * the cheap path gets first look; if it turns out to be a continuation, the model hands
 * over and it is back in the queue within one turn.
 *
 * The old assignment is dropped with it — leaving it in place would keep the conversation
 * on an Agent's list while the assistant is the one answering.
 *
 * Returns whether anything changed. A conversation that was never resolved is untouched:
 * a customer writing to an Agent mid-conversation must not be bounced back to the model,
 * because Escalation is one-way.
 */
export async function reopenIfResolved(conversationId: string): Promise<boolean> {
    const sql = getSqlAdmin();
    const rows = await sql<{ id: string }[]>`
        UPDATE support_conversations
           SET status = 'ai_active',
               assigned_admin_id = NULL,
               escalation_reason = NULL
         WHERE id = ${conversationId}
           AND status = 'resolved'
        RETURNING id
    `;
    return rows.length > 0;
}

export async function resolveConversation(
    conversationId: string,
    adminId: string,
): Promise<void> {
    const sql = getSqlAdmin();
    await sql`
        UPDATE support_conversations
           SET status = 'resolved',
               assigned_admin_id = COALESCE(assigned_admin_id, ${adminId})
         WHERE id = ${conversationId}
    `;
}
