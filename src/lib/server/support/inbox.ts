import { getSqlAdmin } from '@/lib/db/postgres';
import { appendMessage, type SupportMessage } from './messages';
import { URGENCY_SQL, urgencyFromRank, type Urgency } from './urgency';
import type { SupportNote } from './notes';
import type { LinkedBooking } from './linked-bookings';
import { assertCanWriteIn, type SupportActor } from './assignment';

/**
 * The Agent's side of a Support Chat: the queues, and answering.
 *
 * Ownership is given by an admin, never taken — see `assignment.ts` and ADR-0041. Answering
 * a chat does not assign it; it only moves it out of Waiting.
 */

/**
 * The inbox's views.
 *
 *   unassigned  no Support Agent has it — the admins' queue to hand out
 *   mine        assigned to me
 *   assigned    assigned to anyone — who has what; every Agent may read these
 *   assistant   residue from the retired assistant (ADR-0031)
 *   resolved    finished
 */
export type InboxFilter = 'unassigned' | 'mine' | 'assigned' | 'assistant' | 'resolved';

/** The statuses of a chat a person is responsible for — not the retired assistant's. */
const WORKED_STATUSES = `('waiting_human', 'human_active')`;

/**
 * The customer has actually said something. The widget creates a conversation the moment the
 * panel opens — and a new one each time a resolved chat's customer opens it again — so without
 * this the admins' queue fills with chats nobody wrote in. A chat is Waiting from its first
 * message (CONTEXT.md, "Waiting"), not from a panel being opened.
 */
const CUSTOMER_HAS_WRITTEN = `EXISTS (SELECT 1 FROM support_messages m
                                   WHERE m.conversation_id = c.id AND m.sender_type = 'guest')`;

export interface InboxRow {
    id: string;
    status: string;
    sourceBrand: string | null;
    locale: string;
    guestName: string | null;
    guestEmail: string | null;
    userId: string | null;
    assignedAdminId: string | null;
    /** Who it is assigned to, named — so an Agent reading a colleague's chat knows whose. */
    assignedAdminName: string | null;
    escalationReason: string | null;
    /** The Chat Reference, e.g. CS-9QM2K7. Names the conversation; grants nothing (ADR-0038). */
    reference: string;
    /** An Agent overruling computed Urgency. NULL means the trip dates decide (ADR-0039). */
    priority: string | null;
    /**
     * What the queue actually sorted by: the override if there is one, otherwise the tier
     * read from the linked trips. Computed per read, never stored — see ADR-0039.
     */
    urgency: Urgency;
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
    (SELECT COALESCE(NULLIF(TRIM(CONCAT_WS(' ', a.first_name, a.last_name)), ''), a.email)
       FROM users a WHERE a.id = c.assigned_admin_id) AS "assignedAdminName",
    c.escalation_reason  AS "escalationReason",
    c.reference,
    c.priority,
    ${URGENCY_SQL} AS "urgencyRank",
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
 * one deliberately does not: a AirangGo customer waiting would be invisible on the
 * CheapestGo admin, and nobody would learn the conversation existed. See ADR-0030.
 *
 * `unassigned` is ordered by how close the customer is to travelling and only then by how
 * long they have waited; everything else is newest-first, which is how you read a list you
 * are browsing rather than working.
 *
 * It used to be oldest-first alone, on the reasoning that the longest wait is the most
 * urgent. That holds only while nothing distinguishes the people in the queue, and in
 * travel something does: a customer at an airport and a customer asking about a receipt
 * are not interchangeable, and the dates that say so are already known. Waiting time is
 * still the tie-break, so within a tier the rule is exactly what it was. See ADR-0039.
 */
export async function listInbox({ filter, adminId }: ListInboxInput): Promise<InboxRow[]> {
    const sql = getSqlAdmin();

    const where = {
        unassigned: `c.assigned_admin_id IS NULL AND c.status IN ${WORKED_STATUSES} AND ${CUSTOMER_HAS_WRITTEN}`,
        mine: `c.assigned_admin_id = $1 AND c.status <> 'resolved'`,
        assigned: `c.assigned_admin_id IS NOT NULL AND c.status <> 'resolved'`,
        assistant: `c.status = 'ai_active'`,
        resolved: `c.status = 'resolved'`,
    }[filter];

    const order = filter === 'unassigned'
        ? `${URGENCY_SQL} DESC, c.last_message_at ASC`
        : 'c.last_message_at DESC';
    const params = filter === 'mine' ? [adminId ?? null] : [];

    const rows = await sql.unsafe<(InboxRow & { urgencyRank?: number })[]>(
        `SELECT ${ROW_COLUMNS}
           FROM support_conversations c
          WHERE ${where}
          ORDER BY ${order}
          LIMIT ${INBOX_PAGE_SIZE}`,
        params,
    );
    return rows.map(toInboxRow);
}

/**
 * The query sorts by a number and the screen shows a word, so the rank is translated here
 * and the raw column dropped. Callers get the tier the queue actually used — not a second
 * computation that could disagree with the ordering they are looking at.
 */
function toInboxRow(row: InboxRow & { urgencyRank?: number }): InboxRow {
    const { urgencyRank, ...rest } = row;
    return { ...rest, urgency: urgencyFromRank(urgencyRank) };
}

export interface InboxCounts {
    /** Chats no Support Agent has — the admins' queue. */
    unassigned: number;
    mine: number;
    /**
     * What the sidebar badge shows: the chats that need *this person* now. For an admin, the
     * Unassigned queue — handing those out is their job. For a Support Agent, their own chats
     * nobody has answered yet — other people's queues are not theirs to be alarmed by.
     */
    waiting: number;
}

/**
 * The numbers for the inbox tabs and the sidebar badge.
 *
 * Both span both brands for the same reason the list does — a count that hides a brand is
 * worse than no count, because it looks authoritative.
 */
export async function inboxCounts(actor: { id: string; role: string }): Promise<InboxCounts> {
    const sql = getSqlAdmin();
    const rows = await sql<{ unassigned: string; mine: string; mineWaiting: string }[]>`
        SELECT
            count(*) FILTER (WHERE c.assigned_admin_id IS NULL
                               AND c.status IN ('waiting_human', 'human_active')
                               AND EXISTS (SELECT 1 FROM support_messages m
                                            WHERE m.conversation_id = c.id AND m.sender_type = 'guest')) AS unassigned,
            count(*) FILTER (WHERE c.assigned_admin_id = ${actor.id} AND c.status <> 'resolved') AS mine,
            count(*) FILTER (WHERE c.assigned_admin_id = ${actor.id} AND c.status = 'waiting_human') AS "mineWaiting"
          FROM support_conversations c
    `;
    const unassigned = Number(rows[0]?.unassigned ?? 0);
    const mineWaiting = Number(rows[0]?.mineWaiting ?? 0);
    return {
        unassigned,
        mine: Number(rows[0]?.mine ?? 0),
        waiting: actor.role === 'admin' ? unassigned : mineWaiting,
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
    /** The trips this chat is about. Any number, including none — see ADR-0039. */
    linkedBookings: LinkedBooking[];
    /**
     * What Agents have written to each other here.
     *
     * Loaded on this path and no other. The customer's routes read `listMessages`, which
     * cannot reach the notes table at all — that separation is the whole reason a Note is
     * not a `sender_type`.
     */
    notes: SupportNote[];
    /**
     * This customer's other Support Chats, newest first. A resolved chat is never reopened —
     * a returning customer gets a new one — so this is where the Agent finds what was said
     * before. Empty for a guest: there is no verified identity to link chats by.
     */
    previousConversations: PreviousConversation[];
}

export interface PreviousConversation {
    id: string;
    reference: string;
    status: string;
    createdAt: string;
    lastMessageAt: string;
    /** Who held it — for a resolved chat, who handled it. */
    assignedAdminName: string | null;
}

/** One conversation, with everything an Agent needs to answer it without leaving. */
export async function getConversationForAgent(
    conversationId: string,
): Promise<AgentConversationDetail | null> {
    const sql = getSqlAdmin();
    const rows = await sql.unsafe<(InboxRow & { urgencyRank?: number })[]>(
        `SELECT ${ROW_COLUMNS} FROM support_conversations c WHERE c.id = $1`,
        [conversationId],
    );

    const raw = rows[0];
    if (!raw) return null;
    const conversation = toInboxRow(raw);

    const [{ listMessages }, { listNotes }, { listLinkedBookings }] = await Promise.all([
        import('./messages'),
        import('./notes'),
        import('./linked-bookings'),
    ]);
    const [messages, notes, linkedBookings] = await Promise.all([
        listMessages(conversationId),
        listNotes(conversationId),
        listLinkedBookings(conversationId),
    ]);

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

    const previousConversations = conversation.userId
        ? await sql<PreviousConversation[]>`
            SELECT c.id, c.reference, c.status,
                   c.created_at AS "createdAt", c.last_message_at AS "lastMessageAt",
                   (SELECT COALESCE(NULLIF(TRIM(CONCAT_WS(' ', a.first_name, a.last_name)), ''), a.email)
                      FROM users a WHERE a.id = c.assigned_admin_id) AS "assignedAdminName"
              FROM support_conversations c
             WHERE c.user_id = ${conversation.userId} AND c.id <> ${conversationId}
             ORDER BY c.created_at DESC
             LIMIT 20
          `
        : [];

    return {
        conversation,
        messages: await withAuthorNames(messages),
        bookings,
        notes,
        linkedBookings,
        previousConversations,
    };
}

/**
 * Who wrote each Agent reply, by name.
 *
 * The transcript puts staff replies on one side and names their author above each run, and
 * the name matters: an admin may write in a chat they do not own without taking it, so two
 * colleagues' words sit in one column and only the caption tells them apart (CONTEXT.md,
 * "Assignment"). One query for the distinct authors rather than a join on the messages
 * select — a chat is answered by one or two people, however long it runs.
 */
async function withAuthorNames<T extends { senderAdminId?: string | null }>(messages: T[]): Promise<T[]> {
    const ids = [...new Set(messages.map(m => m.senderAdminId).filter((id): id is string => !!id))];
    if (ids.length === 0) return messages;

    const sql = getSqlAdmin();
    const rows = await sql<{ id: string; name: string }[]>`
        SELECT id, COALESCE(NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)), ''), email) AS name
          FROM users WHERE id = ANY(${ids}::uuid[])
    `;
    const names = new Map(rows.map(r => [r.id, r.name]));
    return messages.map(m => (m.senderAdminId ? { ...m, senderName: names.get(m.senderAdminId) ?? null } : m));
}

export interface AgentReplyInput {
    conversationId: string;
    actor: SupportActor;
    body: string;
    /** Files the Agent uploaded to this conversation, to go out with the reply. */
    attachmentIds?: string[];
}

/**
 * Answer a customer.
 *
 * Only in a chat the actor may write in — their own, or any if they are an admin. Answering
 * never assigns: until 2026-09-11 the first reply took the chat, which made the queue a race
 * between colleagues paid by the chats they win (ADR-0041). It still moves the chat out of
 * Waiting, because the customer has now been answered.
 */
export async function agentReply(input: AgentReplyInput): Promise<SupportMessage> {
    await assertCanWriteIn(input.actor, input.conversationId);

    const sql = getSqlAdmin();
    await sql`
        UPDATE support_conversations
           SET status = 'human_active'
         WHERE id = ${input.conversationId}
           AND status = 'waiting_human'
    `;

    return appendMessage({
        conversationId: input.conversationId,
        senderType: 'agent',
        senderAdminId: input.actor.id,
        body: input.body,
        attachmentIds: input.attachmentIds,
    });
}

// A resolved chat is never reopened: the customer's next message starts a new one
// (`openConversation`, CONTEXT.md "Support Chat"). `reopenIfResolved` went with that.

// Resolving lives with the rest of Assignment now, because it records who handled the chat.
export { resolveConversation } from './assignment';
