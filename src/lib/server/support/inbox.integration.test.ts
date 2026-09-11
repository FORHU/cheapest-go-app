import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import {
    listInbox,
    inboxCounts,
    agentReply,
    reopenIfResolved,
    getConversationForAgent,
    type InboxFilter,
} from './inbox';
import {
    assignConversation,
    returnToQueue,
    resolveConversation,
    releaseConversationsOf,
    handledTally,
    SupportPermissionError,
    type SupportActor,
} from './assignment';

/**
 * The Agent's side of a Support Chat, and Assignment by admin (ADR-0041).
 *
 * Integration rather than unit tests: every decision here is expressed in SQL — which
 * conversations are in which queue, what order they are in, who may write where, and what
 * is recorded when a chat changes hands or is resolved. A fake store would test the shape
 * of the code and none of the behaviour.
 *
 * Skips when no database is reachable.
 */

async function databaseReachable(): Promise<boolean> {
    if (!process.env.DATABASE_URL) return false;
    try {
        const { getSqlAdmin } = await import('@/lib/db/postgres');
        await getSqlAdmin()`SELECT 1`;
        return true;
    } catch {
        return false;
    }
}

async function sql() {
    const { getSqlAdmin } = await import('@/lib/db/postgres');
    return getSqlAdmin();
}

async function makeUser(role: 'admin' | 'support_agent' | 'user', label: string): Promise<SupportActor> {
    const db = await sql();
    const rows = await db<{ id: string }[]>`
        INSERT INTO users (email, role, first_name)
        VALUES (${`inbox-test-${label}-${crypto.randomUUID()}@example.com`}, ${role}, ${label})
        RETURNING id
    `;
    createdUsers.push(rows[0].id);
    return { id: rows[0].id, role: role === 'user' ? 'support_agent' : role };
}

interface MakeConversation {
    status?: string;
    brand?: string;
    guestName?: string | null;
    minutesAgo?: number;
}

async function makeConversation(over: MakeConversation = {}): Promise<string> {
    const db = await sql();
    const {
        status = 'waiting_human',
        brand = 'CheapestGo',
        guestName = 'Ana Reyes',
        minutesAgo = 0,
    } = over;

    const rows = await db<{ id: string }[]>`
        INSERT INTO support_conversations
            (guest_token_hash, guest_name, guest_email, source_brand, locale, status, last_message_at)
        VALUES (
            ${`t-${crypto.randomUUID()}`},
            ${guestName},
            ${guestName ? 'ana@example.com' : null},
            ${brand},
            'en',
            ${status},
            now() - (${minutesAgo}::text || ' minutes')::interval
        )
        RETURNING id
    `;
    created.push(rows[0].id);
    return rows[0].id;
}

async function statusOf(id: string): Promise<string> {
    const db = await sql();
    const rows = await db<{ status: string }[]>`SELECT status FROM support_conversations WHERE id = ${id}`;
    return rows[0]?.status ?? 'gone';
}

async function assigneeOf(id: string): Promise<string | null> {
    const db = await sql();
    const rows = await db<{ assigned_admin_id: string | null }[]>`
        SELECT assigned_admin_id FROM support_conversations WHERE id = ${id}
    `;
    return rows[0]?.assigned_admin_id ?? null;
}

async function eventsOf(id: string) {
    const db = await sql();
    return db<{ kind: string; from_admin_id: string | null; to_admin_id: string | null; actor_admin_id: string | null }[]>`
        SELECT kind, from_admin_id, to_admin_id, actor_admin_id
          FROM support_assignment_events WHERE conversation_id = ${id}
         ORDER BY created_at, id
    `;
}

const ids = (rows: { id: string }[]) => rows.map(r => r.id);

/**
 * The rows from a query that this file put there. The inbox is deliberately unfiltered — it
 * shows every conversation on the site — so a query also returns other test files' rows.
 */
const ours = (rows: { id: string }[]) => rows.filter(r => created.includes(r.id)).map(r => r.id);

/** Exactly what this file created, so cleanup removes only that. */
const created: string[] = [];
const createdUsers: string[] = [];

async function cleanUp() {
    const db = await sql();
    // Conversations first: `users.id` is ON DELETE SET NULL, and a conversation with no
    // owner would violate support_conversations_has_owner_check.
    if (created.length) {
        await db`DELETE FROM support_conversations WHERE id = ANY(${db.array(created)}::uuid[])`;
    }
    if (createdUsers.length) {
        await db`DELETE FROM users WHERE id = ANY(${db.array(createdUsers)}::uuid[])`;
    }
    created.length = 0;
    createdUsers.length = 0;
}

let admin: SupportActor;
let agentA: SupportActor;
let agentB: SupportActor;

beforeEach(async () => {
    if (!(await databaseReachable())) return;
    await cleanUp();
    admin = await makeUser('admin', 'Admin');
    agentA = await makeUser('support_agent', 'Aida');
    agentB = await makeUser('support_agent', 'Ben');
});

afterAll(async () => {
    if (!process.env.DATABASE_URL) return;
    await cleanUp().catch(() => {});
    const db = await sql();
    await db.end({ timeout: 1 }).catch(() => {});
});

describe('listInbox', () => {
    it('shows the Unassigned queue oldest first, because the longest wait is the most urgent', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        const recent = await makeConversation({ minutesAgo: 2 });
        const oldest = await makeConversation({ minutesAgo: 90 });
        const middle = await makeConversation({ minutesAgo: 20 });

        expect(ours(await listInbox({ filter: 'unassigned' }))).toEqual([oldest, middle, recent]);
    });

    it('keeps both brands in one queue', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        // ADR-0030: a AirangGo customer must not be invisible on the CheapestGo admin.
        const cheapestgo = await makeConversation({ brand: 'CheapestGo', minutesAgo: 10 });
        const airanggo = await makeConversation({ brand: 'AirangGo', minutesAgo: 5 });

        expect(ours(await listInbox({ filter: 'unassigned' })).sort()).toEqual([cheapestgo, airanggo].sort());
    });

    it('keeps a chat an admin answered without assigning in Unassigned', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        // Answered is not owned: the admin helped, and the chat still needs someone.
        const id = await makeConversation();
        await agentReply({ conversationId: id, actor: admin, body: 'Looking into it.' });

        expect(await statusOf(id)).toBe('human_active');
        expect(ours(await listInbox({ filter: 'unassigned' }))).toEqual([id]);
    });

    it('separates the retired assistant from what needs a person', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        const waiting = await makeConversation({ status: 'waiting_human' });
        const withAssistant = await makeConversation({ status: 'ai_active' });

        expect(ours(await listInbox({ filter: 'unassigned' }))).toEqual([waiting]);
        expect(ours(await listInbox({ filter: 'assistant' }))).toEqual([withAssistant]);
    });

    it('shows an Agent only their own under mine, and everyone\'s under assigned', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        const mine = await makeConversation();
        const theirs = await makeConversation();
        await assignConversation({ conversationId: mine, toAdminId: agentA.id, actor: admin });
        await assignConversation({ conversationId: theirs, toAdminId: agentB.id, actor: admin });

        expect(ours(await listInbox({ filter: 'mine', adminId: agentA.id }))).toEqual([mine]);
        expect(ours(await listInbox({ filter: 'assigned' })).sort()).toEqual([mine, theirs].sort());
        expect(ours(await listInbox({ filter: 'unassigned' }))).toEqual([]);
    });

    it('names who a chat is assigned to', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        const id = await makeConversation();
        await assignConversation({ conversationId: id, toAdminId: agentA.id, actor: admin });

        const row = (await listInbox({ filter: 'assigned' })).find(r => r.id === id)!;
        expect(row.assignedAdminName).toBe('Aida');
    });

    it('keeps resolved conversations out of every working view', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        const done = await makeConversation({ status: 'resolved' });

        for (const filter of ['unassigned', 'assigned', 'assistant'] as InboxFilter[]) {
            expect(ids(await listInbox({ filter }))).not.toContain(done);
        }
        expect(ours(await listInbox({ filter: 'resolved' }))).toEqual([done]);
    });
});

describe('inboxCounts', () => {
    it("shows an admin the Unassigned queue on the badge", async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        // A delta: the count is site-wide by design, so other files' rows are in it.
        const before = await inboxCounts(admin);
        await makeConversation({ status: 'waiting_human' });
        await makeConversation({ status: 'waiting_human', brand: 'AirangGo' });
        await makeConversation({ status: 'ai_active' });
        await makeConversation({ status: 'resolved' });
        const after = await inboxCounts(admin);

        expect(after.unassigned - before.unassigned).toBe(2);
        expect(after.waiting - before.waiting).toBe(2);
    });

    it('shows a Support Agent only their own unanswered chats on the badge', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        const before = await inboxCounts(agentA);
        const mine = await makeConversation();
        await makeConversation(); // Unassigned — not theirs to be alarmed by.
        await assignConversation({ conversationId: mine, toAdminId: agentA.id, actor: admin });
        const after = await inboxCounts(agentA);

        expect(after.waiting - before.waiting).toBe(1);
        expect(after.mine - before.mine).toBe(1);
    });
});

describe('agentReply — writing follows Assignment', () => {
    it('never assigns: the first reply takes nothing', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        const id = await makeConversation();
        await agentReply({ conversationId: id, actor: admin, body: 'Looking into it.' });

        expect(await assigneeOf(id)).toBeNull();
        expect(await statusOf(id)).toBe('human_active');
    });

    it('lets a Support Agent reply in a chat assigned to them', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        const id = await makeConversation();
        await assignConversation({ conversationId: id, toAdminId: agentA.id, actor: admin });
        const message = await agentReply({ conversationId: id, actor: agentA, body: 'Hello, I have it.' });

        expect(message.senderType).toBe('agent');
        expect(message.senderAdminId).toBe(agentA.id);
    });

    it('refuses a Support Agent in an Unassigned chat — there is nothing to race for', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        const id = await makeConversation();
        await expect(agentReply({ conversationId: id, actor: agentA, body: 'Mine!' }))
            .rejects.toBeInstanceOf(SupportPermissionError);
        expect(await assigneeOf(id)).toBeNull();
    });

    it("refuses a Support Agent in a colleague's chat", async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        const id = await makeConversation();
        await assignConversation({ conversationId: id, toAdminId: agentB.id, actor: admin });

        await expect(agentReply({ conversationId: id, actor: agentA, body: 'I can help.' }))
            .rejects.toBeInstanceOf(SupportPermissionError);
    });

    it("lets an admin write in anyone's chat without taking it", async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        const id = await makeConversation();
        await assignConversation({ conversationId: id, toAdminId: agentB.id, actor: admin });
        await agentReply({ conversationId: id, actor: admin, body: 'Adding a note for you.' });

        expect(await assigneeOf(id)).toBe(agentB.id);
    });

    it('refuses an empty reply', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        const id = await makeConversation();
        await expect(agentReply({ conversationId: id, actor: admin, body: '   ' })).rejects.toThrow();
    });
});

describe('assignConversation', () => {
    it('gives a chat to a Support Agent and records it', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        const id = await makeConversation();
        await assignConversation({ conversationId: id, toAdminId: agentA.id, actor: admin });

        expect(await assigneeOf(id)).toBe(agentA.id);
        expect(await eventsOf(id)).toEqual([
            { kind: 'assigned', from_admin_id: null, to_admin_id: agentA.id, actor_admin_id: admin.id },
        ]);
    });

    it('records a reassignment as from one person to another', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        const id = await makeConversation();
        await assignConversation({ conversationId: id, toAdminId: agentA.id, actor: admin });
        await assignConversation({ conversationId: id, toAdminId: agentB.id, actor: admin });

        expect((await eventsOf(id)).at(-1)).toEqual(
            { kind: 'assigned', from_admin_id: agentA.id, to_admin_id: agentB.id, actor_admin_id: admin.id },
        );
    });

    it('refuses a Support Agent — assigning is an admin decision', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        const id = await makeConversation();
        await expect(assignConversation({ conversationId: id, toAdminId: agentA.id, actor: agentA }))
            .rejects.toBeInstanceOf(SupportPermissionError);
    });

    it('refuses someone who cannot answer Support Chats', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        const id = await makeConversation();
        const customer = await makeUser('user', 'Customer');
        await expect(assignConversation({ conversationId: id, toAdminId: customer.id, actor: admin }))
            .rejects.toThrow(/cannot answer/i);
    });

    it('does not assign a resolved chat', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        const id = await makeConversation({ status: 'resolved' });
        await expect(assignConversation({ conversationId: id, toAdminId: agentA.id, actor: admin }))
            .rejects.toThrow(/resolved/i);
    });
});

describe('returnToQueue', () => {
    it('lets a Support Agent give their chat back to Unassigned, recorded', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        const id = await makeConversation();
        await assignConversation({ conversationId: id, toAdminId: agentA.id, actor: admin });
        await returnToQueue({ conversationId: id, actor: agentA });

        expect(await assigneeOf(id)).toBeNull();
        expect((await eventsOf(id)).at(-1)).toMatchObject({ kind: 'returned', from_admin_id: agentA.id });
    });

    it("refuses giving back a chat that is not yours", async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        const id = await makeConversation();
        await assignConversation({ conversationId: id, toAdminId: agentB.id, actor: admin });

        await expect(returnToQueue({ conversationId: id, actor: agentA }))
            .rejects.toBeInstanceOf(SupportPermissionError);
        expect(await assigneeOf(id)).toBe(agentB.id);
    });
});

describe('resolveConversation — Handled', () => {
    it('credits the chat to whoever held it when it was resolved', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        const id = await makeConversation();
        await assignConversation({ conversationId: id, toAdminId: agentA.id, actor: admin });
        await resolveConversation({ conversationId: id, actor: agentA });

        expect(await statusOf(id)).toBe('resolved');
        expect((await eventsOf(id)).at(-1)).toMatchObject({ kind: 'resolved', to_admin_id: agentA.id });
    });

    it('does not make an admin the owner of an Unassigned chat they close', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        const id = await makeConversation();
        await resolveConversation({ conversationId: id, actor: admin });

        expect(await assigneeOf(id)).toBeNull();
        expect((await eventsOf(id)).at(-1)).toMatchObject({ kind: 'resolved', to_admin_id: null });
    });

    it("refuses a Support Agent closing a colleague's chat", async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        const id = await makeConversation();
        await assignConversation({ conversationId: id, toAdminId: agentB.id, actor: admin });

        await expect(resolveConversation({ conversationId: id, actor: agentA }))
            .rejects.toBeInstanceOf(SupportPermissionError);
    });

    it('tallies handled chats per person, counting a reopened chat again', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        const since = new Date(Date.now() - 60_000);
        const first = await makeConversation();
        const second = await makeConversation();
        await assignConversation({ conversationId: first, toAdminId: agentA.id, actor: admin });
        await assignConversation({ conversationId: second, toAdminId: agentB.id, actor: admin });
        await resolveConversation({ conversationId: first, actor: agentA });
        await resolveConversation({ conversationId: second, actor: agentB });

        // The first customer comes back; the admin gives it to Ben this time.
        await reopenIfResolved(first);
        await assignConversation({ conversationId: first, toAdminId: agentB.id, actor: admin });
        await resolveConversation({ conversationId: first, actor: agentB });

        const tally = await handledTally(since);
        const of = (actor: SupportActor) => tally.find(t => t.adminId === actor.id)!;
        expect(of(agentA).handled).toBe(1);
        expect(of(agentB).handled).toBe(2);
        expect(of(agentA).name).toBe('Aida');
    });
});

describe('getConversationForAgent', () => {
    it('returns the transcript with the customer and the hand-over reason', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        const id = await makeConversation();
        const db = await sql();
        await db`UPDATE support_conversations SET escalation_reason = 'refund request' WHERE id = ${id}`;
        await agentReply({ conversationId: id, actor: admin, body: 'On it.' });

        const detail = await getConversationForAgent(id);

        expect(detail?.conversation.guestName).toBe('Ana Reyes');
        expect(detail?.conversation.escalationReason).toBe('refund request');
        expect(detail?.messages.map(m => m.body)).toEqual(['On it.']);
    });

    it('shows no bookings for a guest, however plausible their email looks', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        // ADR-0029: an unverified email is not a credential.
        const id = await makeConversation();

        expect((await getConversationForAgent(id))?.bookings).toBeNull();
    });

    it('shows bookings for a signed-in customer', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        const db = await sql();
        const customer = await makeUser('user', 'Customer');
        const rows = await db<{ id: string }[]>`
            INSERT INTO support_conversations (user_id, source_brand, locale, status)
            VALUES (${customer.id}, 'CheapestGo', 'en', 'waiting_human')
            RETURNING id
        `;
        created.push(rows[0].id);

        expect((await getConversationForAgent(rows[0].id))?.bookings).toBeInstanceOf(Array);
    }, 20_000);

    it('returns nothing for a conversation that does not exist', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        expect(await getConversationForAgent(crypto.randomUUID())).toBeNull();
    });
});

describe('reopenIfResolved', () => {
    it('hands a resolved conversation back to Unassigned when the customer writes', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        const id = await makeConversation({ status: 'resolved' });

        expect(await reopenIfResolved(id)).toBe(true);
        expect(await statusOf(id)).toBe('waiting_human');
        expect(ours(await listInbox({ filter: 'unassigned' }))).toEqual([id]);
    });

    it('drops the previous assignment and records the reopen', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        const id = await makeConversation();
        await assignConversation({ conversationId: id, toAdminId: agentA.id, actor: admin });
        await resolveConversation({ conversationId: id, actor: agentA });
        await reopenIfResolved(id);

        expect(await assigneeOf(id)).toBeNull();
        expect(ids(await listInbox({ filter: 'mine', adminId: agentA.id }))).not.toContain(id);
        expect((await eventsOf(id)).at(-1)).toMatchObject({ kind: 'reopened', from_admin_id: agentA.id });
    });

    it('leaves a conversation that was never resolved exactly as it is', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        const id = await makeConversation();
        await assignConversation({ conversationId: id, toAdminId: agentA.id, actor: admin });
        await agentReply({ conversationId: id, actor: agentA, body: 'On it.' });

        expect(await reopenIfResolved(id)).toBe(false);
        expect(await statusOf(id)).toBe('human_active');
        expect(await assigneeOf(id)).toBe(agentA.id);
    });
});

describe('releaseConversationsOf', () => {
    it('returns a demoted Support Agent\'s open chats to Unassigned', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        const open = await makeConversation();
        const done = await makeConversation();
        await assignConversation({ conversationId: open, toAdminId: agentA.id, actor: admin });
        await assignConversation({ conversationId: done, toAdminId: agentA.id, actor: admin });
        await resolveConversation({ conversationId: done, actor: agentA });

        expect(await releaseConversationsOf(agentA.id, admin.id)).toBe(1);
        expect(await assigneeOf(open)).toBeNull();
        // A resolved chat keeps its record: it was handled, and that does not change.
        expect(await assigneeOf(done)).toBe(agentA.id);
        expect((await eventsOf(open)).at(-1)).toMatchObject({ kind: 'released', from_admin_id: agentA.id });
    });
});
