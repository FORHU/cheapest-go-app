import { getSqlAdmin } from '@/lib/db/postgres';
import { publish } from './events';
import { SupportValidationError } from './conversations';
import type { Role } from '@/lib/auth/roles';

/**
 * Whose a Support Chat is — given by an admin, never taken (ADR-0041, CONTEXT.md
 * "Assignment").
 *
 * Support Agents are paid by the chats they handle. Assignment used to be taken by answering
 * — the first reply owned the chat — which made the queue a race between colleagues. Now:
 *
 *   - an admin assigns and reassigns; nothing else does, not a timer and not a reply
 *   - a Support Agent reads every chat but writes only in their own, and may give one back
 *   - an admin writes anywhere without that changing whose it is
 *   - every change is recorded in `support_assignment_events`, and so is every resolution,
 *     because a chat is **Handled** by whoever held it when it was resolved
 */

export interface SupportActor {
    id: string;
    role: Role;
}

/** Thrown when an actor tries something their role or the chat's owner does not allow. */
export class SupportPermissionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'SupportPermissionError';
    }
}

/**
 * Whether this actor may write in this chat — reply, attach, resolve, change its urgency or
 * its linked trips. An admin may write anywhere; a Support Agent only in a chat assigned to
 * them. Reading is not gated: every Agent may read every chat.
 */
export function canWriteIn(actor: SupportActor, assignedAdminId: string | null): boolean {
    return actor.role === 'admin' || assignedAdminId === actor.id;
}

/** Refuse with a sentence the Agent can act on, naming why. */
export async function assertCanWriteIn(actor: SupportActor, conversationId: string): Promise<void> {
    if (actor.role === 'admin') return;

    const sql = getSqlAdmin();
    const [row] = await sql<{ assignedAdminId: string | null }[]>`
        SELECT assigned_admin_id AS "assignedAdminId"
          FROM support_conversations WHERE id = ${conversationId}
    `;
    if (!row) throw new SupportValidationError('No such conversation.');
    if (canWriteIn(actor, row.assignedAdminId)) return;

    throw new SupportPermissionError(row.assignedAdminId
        ? 'This chat is assigned to someone else. You can read it, but only they can reply.'
        : 'This chat is not assigned yet. An admin will give it to someone.');
}

type Queryable = ReturnType<typeof getSqlAdmin>;

async function recordEvent(
    sql: Queryable,
    event: {
        conversationId: string;
        kind: 'assigned' | 'returned' | 'reopened' | 'released' | 'resolved';
        fromAdminId?: string | null;
        toAdminId?: string | null;
        actorAdminId?: string | null;
    },
): Promise<void> {
    await sql`
        INSERT INTO support_assignment_events
            (conversation_id, kind, from_admin_id, to_admin_id, actor_admin_id)
        VALUES (${event.conversationId}, ${event.kind}, ${event.fromAdminId ?? null},
                ${event.toAdminId ?? null}, ${event.actorAdminId ?? null})
    `;
}

/**
 * Give a chat to someone. Admins only — the route checks the role; this checks the target.
 *
 * The target must be able to answer Support Chats at all: an admin (assigning to themselves
 * or another admin) or a Support Agent. A resolved chat is not assigned — it has no work
 * left; it returns to Unassigned when the customer writes again.
 */
export async function assignConversation(input: {
    conversationId: string;
    toAdminId: string;
    actor: SupportActor;
}): Promise<void> {
    if (input.actor.role !== 'admin') {
        throw new SupportPermissionError('Only an admin can assign a chat.');
    }

    const sql = getSqlAdmin();
    const [target] = await sql<{ role: string }[]>`
        SELECT role FROM users WHERE id = ${input.toAdminId} AND banned_at IS NULL
    `;
    if (!target || (target.role !== 'admin' && target.role !== 'support_agent')) {
        throw new SupportValidationError('That person cannot answer Support Chats.');
    }

    const moved = await sql.begin(async tx => {
        const [before] = await tx<{ assignedAdminId: string | null; status: string }[]>`
            SELECT assigned_admin_id AS "assignedAdminId", status
              FROM support_conversations WHERE id = ${input.conversationId}
               FOR UPDATE
        `;
        if (!before) throw new SupportValidationError('No such conversation.');
        if (before.status === 'resolved') {
            throw new SupportValidationError('This chat is resolved. It returns to Unassigned if the customer writes again.');
        }
        if (before.assignedAdminId === input.toAdminId) return false;

        await tx`
            UPDATE support_conversations SET assigned_admin_id = ${input.toAdminId}
             WHERE id = ${input.conversationId}
        `;
        await recordEvent(tx as unknown as Queryable, {
            conversationId: input.conversationId,
            kind: 'assigned',
            fromAdminId: before.assignedAdminId,
            toAdminId: input.toAdminId,
            actorAdminId: input.actor.id,
        });
        return true;
    });

    if (moved) await publish({ conversationId: input.conversationId, messageId: null });
}

/**
 * A Support Agent gives their own chat back to Unassigned, for an admin to hand out again.
 * Only back — never to a named colleague, which would be an Agent assigning.
 */
export async function returnToQueue(input: { conversationId: string; actor: SupportActor }): Promise<void> {
    const sql = getSqlAdmin();
    const rows = await sql<{ id: string }[]>`
        UPDATE support_conversations SET assigned_admin_id = NULL
         WHERE id = ${input.conversationId}
           AND assigned_admin_id = ${input.actor.id}
           AND status <> 'resolved'
        RETURNING id
    `;
    if (rows.length === 0) {
        throw new SupportPermissionError('You can only give back a chat that is assigned to you.');
    }
    await recordEvent(sql, {
        conversationId: input.conversationId,
        kind: 'returned',
        fromAdminId: input.actor.id,
        actorAdminId: input.actor.id,
    });
    await publish({ conversationId: input.conversationId, messageId: null });
}

/**
 * Someone stopped being able to answer Support Chats — demoted, or no longer staff. Their
 * open chats go back to Unassigned rather than sitting with a person who can no longer open
 * the inbox. Returns how many.
 */
export async function releaseConversationsOf(adminId: string, actorAdminId: string | null): Promise<number> {
    const sql = getSqlAdmin();
    const rows = await sql<{ id: string }[]>`
        UPDATE support_conversations SET assigned_admin_id = NULL
         WHERE assigned_admin_id = ${adminId} AND status <> 'resolved'
        RETURNING id
    `;
    for (const { id } of rows) {
        await recordEvent(sql, { conversationId: id, kind: 'released', fromAdminId: adminId, actorAdminId });
        await publish({ conversationId: id, messageId: null });
    }
    return rows.length;
}

/**
 * Mark a chat finished, and record who handled it — whoever holds it now. Resolving never
 * assigns: an admin closing an Unassigned chat does not make it theirs, and the resolution is
 * recorded as handled by nobody.
 */
export async function resolveConversation(input: { conversationId: string; actor: SupportActor }): Promise<void> {
    await assertCanWriteIn(input.actor, input.conversationId);

    const sql = getSqlAdmin();
    const rows = await sql<{ assignedAdminId: string | null }[]>`
        UPDATE support_conversations SET status = 'resolved'
         WHERE id = ${input.conversationId} AND status <> 'resolved'
        RETURNING assigned_admin_id AS "assignedAdminId"
    `;
    if (rows.length === 0) return; // Already resolved; nothing to record twice.

    await recordEvent(sql, {
        conversationId: input.conversationId,
        kind: 'resolved',
        toAdminId: rows[0].assignedAdminId,
        actorAdminId: input.actor.id,
    });
    await publish({ conversationId: input.conversationId, messageId: null });
}

/** Record that a customer reopened a resolved chat, sending it back to Unassigned. */
export async function recordReopened(conversationId: string, previousAdminId: string | null): Promise<void> {
    await recordEvent(getSqlAdmin(), { conversationId, kind: 'reopened', fromAdminId: previousAdminId });
}

export interface AssignableAgent {
    id: string;
    name: string;
    role: 'admin' | 'support_agent';
}

/** Everyone a chat can be given to, Support Agents first — they are who chats are for. */
export async function listAssignableAgents(): Promise<AssignableAgent[]> {
    const sql = getSqlAdmin();
    return sql<AssignableAgent[]>`
        SELECT id,
               COALESCE(NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)), ''), email) AS name,
               role
          FROM users
         WHERE role IN ('support_agent', 'admin') AND banned_at IS NULL
         ORDER BY role = 'admin', name
    `;
}

export interface HandledTally {
    adminId: string;
    name: string;
    role: 'admin' | 'support_agent';
    /** Chats assigned to them now and not resolved. */
    open: number;
    /** Chats resolved while assigned to them, since `since`. */
    handled: number;
}

/**
 * Per person: what they hold now, and what they have handled since `since` — the figure pay
 * is worked out from. Read from the recorded resolutions, never from who holds a chat now.
 */
export async function handledTally(since: Date): Promise<HandledTally[]> {
    const sql = getSqlAdmin();
    return sql<HandledTally[]>`
        SELECT u.id AS "adminId",
               COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''), u.email) AS name,
               u.role,
               (SELECT count(*)::int FROM support_conversations c
                 WHERE c.assigned_admin_id = u.id AND c.status <> 'resolved') AS open,
               (SELECT count(*)::int FROM support_assignment_events e
                 WHERE e.kind = 'resolved' AND e.to_admin_id = u.id AND e.created_at >= ${since}) AS handled
          FROM users u
         WHERE u.role IN ('support_agent', 'admin')
         ORDER BY u.role = 'admin', handled DESC, name
    `;
}
