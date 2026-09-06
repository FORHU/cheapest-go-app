import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import {
    listInbox,
    inboxCounts,
    agentReply,
    resolveConversation,
    reopenIfResolved,
    getConversationForAgent,
    type InboxFilter,
} from './inbox';

/**
 * The Agent's side of a Support Chat.
 *
 * Integration rather than unit tests: every decision here is expressed in SQL — which
 * conversations are in the queue, what order they are in, and the conditional UPDATE that
 * decides which of two Agents owns a conversation. A fake store would test the shape of
 * the code and none of the behaviour.
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

/** An admin to attribute replies to. Agent messages are refused without one. */
async function makeAgent(email: string): Promise<string> {
    const db = await sql();
    const rows = await db<{ id: string }[]>`
        INSERT INTO users (email, role) VALUES (${email}, 'admin') RETURNING id
    `;
    createdUsers.push(rows[0].id);
    return rows[0].id;
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
    const rows = await db<{ status: string }[]>`
        SELECT status FROM support_conversations WHERE id = ${id}
    `;
    return rows[0]?.status ?? 'gone';
}

async function assigneeOf(id: string): Promise<string | null> {
    const db = await sql();
    const rows = await db<{ assigned_admin_id: string | null }[]>`
        SELECT assigned_admin_id FROM support_conversations WHERE id = ${id}
    `;
    return rows[0]?.assigned_admin_id ?? null;
}

const ids = (rows: { id: string }[]) => rows.map(r => r.id);

/**
 * The rows from a query that this file put there.
 *
 * The inbox is deliberately unfiltered — it shows every conversation on the site — so a
 * query here also returns whatever another test file created a moment ago. Scoping the
 * assertion rather than the query keeps these tests about `listInbox`'s real behaviour
 * instead of a version of it that only ever sees an empty table.
 */
const ours = (rows: { id: string }[]) => rows.filter(r => created.includes(r.id)).map(r => r.id);

/**
 * Exactly what this file created, so cleanup removes only that.
 *
 * Vitest runs test files in parallel against one database. A blanket
 * `DELETE FROM support_conversations` here deletes another file's fixtures mid-test —
 * which is how the turn-claim tests started failing once this file existed.
 */
const created: string[] = [];
const createdUsers: string[] = [];

async function cleanUp() {
    const db = await sql();
    // Conversations first. `users.id` is ON DELETE SET NULL, so removing a user before
    // their conversation would null `user_id` on a row with no guest token and violate
    // support_conversations_has_owner_check.
    if (created.length) {
        await db`DELETE FROM support_conversations WHERE id = ANY(${db.array(created)}::uuid[])`;
    }
    if (createdUsers.length) {
        await db`DELETE FROM users WHERE id = ANY(${db.array(createdUsers)}::uuid[])`;
    }
    created.length = 0;
    createdUsers.length = 0;
}

let agentA = '';
let agentB = '';

beforeEach(async () => {
    if (!(await databaseReachable())) return;
    await cleanUp();
    agentA = await makeAgent(`inbox-test-a-${crypto.randomUUID()}@example.com`);
    agentB = await makeAgent(`inbox-test-b-${crypto.randomUUID()}@example.com`);
});

afterAll(async () => {
    if (!process.env.DATABASE_URL) return;
    await cleanUp().catch(() => {});
    const db = await sql();
    await db.end({ timeout: 1 }).catch(() => {});
});

describe('listInbox', () => {
    it('shows the queue oldest first, because the longest wait is the most urgent', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        const recent = await makeConversation({ minutesAgo: 2 });
        const oldest = await makeConversation({ minutesAgo: 90 });
        const middle = await makeConversation({ minutesAgo: 20 });

        expect(ours(await listInbox({ filter: 'waiting' }))).toEqual([oldest, middle, recent]);
    });

    it('keeps both brands in one queue', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        // ADR-0030: a GeomeeGo customer waiting must not be invisible on the CheapestGo
        // admin, which is what following the brand switcher would do.
        const cheapestgo = await makeConversation({ brand: 'CheapestGo', minutesAgo: 10 });
        const geomeego = await makeConversation({ brand: 'GeomeeGo', minutesAgo: 5 });

        expect(ours(await listInbox({ filter: 'waiting' })).sort())
            .toEqual([cheapestgo, geomeego].sort());
    });

    it('separates what the assistant is handling from what needs a person', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        const waiting = await makeConversation({ status: 'waiting_human' });
        const withAssistant = await makeConversation({ status: 'ai_active' });

        expect(ours(await listInbox({ filter: 'waiting' }))).toEqual([waiting]);
        expect(ours(await listInbox({ filter: 'assistant' }))).toEqual([withAssistant]);
    });

    it('shows an Agent only their own conversations under mine', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        const mine = await makeConversation({ status: 'waiting_human' });
        const theirs = await makeConversation({ status: 'waiting_human' });
        await agentReply({ conversationId: mine, adminId: agentA, body: 'On it.' });
        await agentReply({ conversationId: theirs, adminId: agentB, body: 'Mine.' });

        expect(ours(await listInbox({ filter: 'mine', adminId: agentA }))).toEqual([mine]);
    });

    it('keeps resolved conversations out of every working view', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        const done = await makeConversation({ status: 'resolved' });

        for (const filter of ['waiting', 'assistant'] as InboxFilter[]) {
            expect(ids(await listInbox({ filter }))).not.toContain(done);
        }
        expect(ours(await listInbox({ filter: 'resolved' }))).toEqual([done]);
    });

    it('carries what the Agent needs to triage without opening it', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        const id = await makeConversation({ minutesAgo: 5 });
        const row = (await listInbox({ filter: 'waiting' })).find(r => r.id === id)!;

        expect(row.id).toBe(id);
        expect(row.guestName).toBe('Ana Reyes');
        expect(row.sourceBrand).toBe('CheapestGo');
        expect(row.status).toBe('waiting_human');
    });
});

describe('inboxCounts', () => {
    it('counts what is waiting, for the sidebar badge', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        // A delta rather than an absolute: the count is site-wide by design, so another
        // test file's rows are legitimately in it.
        const before = await inboxCounts(agentA);

        await makeConversation({ status: 'waiting_human' });
        await makeConversation({ status: 'waiting_human', brand: 'GeomeeGo' });
        await makeConversation({ status: 'ai_active' });
        await makeConversation({ status: 'resolved' });

        const after = await inboxCounts(agentA);

        // Two, not one: both brands count, per ADR-0030. A badge that hides a brand is
        // worse than no badge, because it looks authoritative.
        expect(after.waiting - before.waiting).toBe(2);
    });
});

describe('agentReply', () => {
    it('takes ownership on the first reply', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        const id = await makeConversation();
        await agentReply({ conversationId: id, adminId: agentA, body: 'Looking into it.' });

        expect(await assigneeOf(id)).toBe(agentA);
        expect(await statusOf(id)).toBe('human_active');
    });

    it('does not steal a conversation someone else already answered', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        // Two agents on a Monday morning. The second reply is still delivered — the
        // customer should not lose it — but ownership stays with whoever got there first.
        const id = await makeConversation();
        await agentReply({ conversationId: id, adminId: agentA, body: 'Looking into it.' });
        await agentReply({ conversationId: id, adminId: agentB, body: 'Me too.' });

        expect(await assigneeOf(id)).toBe(agentA);
    });

    it('gives exactly one owner when two Agents reply at the same instant', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        const id = await makeConversation();
        await Promise.all([
            agentReply({ conversationId: id, adminId: agentA, body: 'A' }),
            agentReply({ conversationId: id, adminId: agentB, body: 'B' }),
        ]);

        expect([agentA, agentB]).toContain(await assigneeOf(id));
    });

    it('attributes the message to the Agent who wrote it', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        const id = await makeConversation();
        const message = await agentReply({
            conversationId: id, adminId: agentA, body: 'Looking into it.',
        });

        expect(message.senderType).toBe('agent');
        expect(message.senderAdminId).toBe(agentA);
    });

    it('refuses an empty reply', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        const id = await makeConversation();
        await expect(agentReply({ conversationId: id, adminId: agentA, body: '   ' }))
            .rejects.toThrow();
    });
});

describe('resolveConversation', () => {
    it('marks a conversation done', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        const id = await makeConversation();
        await agentReply({ conversationId: id, adminId: agentA, body: 'All sorted.' });
        await resolveConversation(id, agentA);

        expect(await statusOf(id)).toBe('resolved');
    });
});

describe('getConversationForAgent', () => {
    it('returns the transcript with the customer and the hand-over reason', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        const id = await makeConversation();
        const db = await sql();
        await db`UPDATE support_conversations SET escalation_reason = 'refund request' WHERE id = ${id}`;
        await agentReply({ conversationId: id, adminId: agentA, body: 'On it.' });

        const detail = await getConversationForAgent(id);

        expect(detail?.conversation.guestName).toBe('Ana Reyes');
        expect(detail?.conversation.escalationReason).toBe('refund request');
        expect(detail?.messages.map(m => m.body)).toEqual(['On it.']);
    });

    it('shows no bookings for a guest, however plausible their email looks', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        // ADR-0029: an unverified email is not a credential. An Agent may still look
        // someone up in the bookings screen — that is a person weighing a claim. What must
        // not happen is a stranger's trips appearing here because they typed an address.
        const id = await makeConversation();

        expect((await getConversationForAgent(id))?.bookings).toBeNull();
    });

    it('shows bookings for a signed-in customer', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        const db = await sql();
        const customer = await makeAgent(`inbox-test-customer-${crypto.randomUUID()}@example.com`);
        const rows = await db<{ id: string }[]>`
            INSERT INTO support_conversations (user_id, source_brand, locale, status)
            VALUES (${customer}, 'CheapestGo', 'en', 'waiting_human')
            RETURNING id
        `;
        // Cleanup deletes users too, and users.id is ON DELETE SET NULL — an unrecorded
        // conversation would have its owner nulled and trip the owner CHECK.
        created.push(rows[0].id);

        // An array, empty or not — the point is that the lookup happened at all.
        expect((await getConversationForAgent(rows[0].id))?.bookings).toBeInstanceOf(Array);
    }, 20_000);

    it('returns nothing for a conversation that does not exist', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        expect(await getConversationForAgent(crypto.randomUUID())).toBeNull();
    });
});

describe('reopenIfResolved', () => {
    it('hands a resolved conversation back to the assistant when the customer writes', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        // Resolved is not an ending. Without this the message is stored, no turn runs, and
        // the conversation is in nobody's queue — the customer is talking to nothing.
        const id = await makeConversation({ status: 'resolved' });

        expect(await reopenIfResolved(id)).toBe(true);
        expect(await statusOf(id)).toBe('ai_active');
    });

    it('drops the previous assignment, so it is not still on an Agent\'s list', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        const id = await makeConversation();
        await agentReply({ conversationId: id, adminId: agentA, body: 'All sorted.' });
        await resolveConversation(id, agentA);
        await reopenIfResolved(id);

        expect(await assigneeOf(id)).toBeNull();
        expect(ids(await listInbox({ filter: 'mine', adminId: agentA }))).not.toContain(id);
    });

    it('leaves a conversation that was never resolved exactly as it is', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        // A customer writing to an Agent mid-conversation must not be bounced back to the
        // assistant. Escalation is one-way.
        const id = await makeConversation();
        await agentReply({ conversationId: id, adminId: agentA, body: 'On it.' });

        expect(await reopenIfResolved(id)).toBe(false);
        expect(await statusOf(id)).toBe('human_active');
        expect(await assigneeOf(id)).toBe(agentA);
    });
});
