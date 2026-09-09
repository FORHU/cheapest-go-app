import { describe, it, expect, vi, afterAll } from 'vitest';
import type { NotifyDeps } from './notify';

/**
 * When the doorbell rings.
 *
 * ADR-0031 moves the trigger. It used to ring on Escalation — a rare event with three
 * named causes — and Escalation no longer exists: every Support Chat is Waiting from
 * birth. Ringing on creation instead would be too early, because the widget opens a
 * conversation the moment the panel does, so the team would get an email about an empty
 * transcript and a second one when the question actually arrived. It rings on the
 * customer's first message into a Waiting conversation nobody owns.
 *
 * "First" is per waiting spell, not per conversation. A customer answered weeks ago, whose
 * chat was Resolved, who comes back with something new is a customer nobody is coming to —
 * so both reopen paths clear the mark and the doorbell rings again.
 *
 * Integration rather than unit, because the whole of "has it already rung?" is a column and
 * a conditional UPDATE. A fake store would assert whatever it was told and would go on
 * passing while every real conversation rang on every message. The mail itself is a fake:
 * `NotifyDeps` exists so this can be asserted without a mail provider or an API key.
 *
 * Skips when no database is reachable, so a machine without Docker stays green.
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

const createdUsers: string[] = [];
const createdConversations: string[] = [];

/** A signed-in customer, because a Support Chat requires an account (ADR-0032). */
async function makeUser(): Promise<string> {
    const db = await sql();
    const rows = await db<{ id: string }[]>`
        INSERT INTO users (email) VALUES (${`support-doorbell-${crypto.randomUUID()}@example.test`})
        RETURNING id
    `;
    createdUsers.push(rows[0].id);
    return rows[0].id;
}

/** A conversation as the widget makes one: Waiting, unassigned, nobody told yet. */
async function makeWaitingConversation(userId: string): Promise<string> {
    const db = await sql();
    const rows = await db<{ id: string }[]>`
        INSERT INTO support_conversations (user_id, source_brand, locale, status)
        VALUES (${userId}, 'CheapestGo', 'en', 'waiting_human')
        RETURNING id
    `;
    createdConversations.push(rows[0].id);
    return rows[0].id;
}

function fakeDeps(over: Partial<NotifyDeps> = {}): NotifyDeps {
    return {
        address: 'support@cheapestgo.test',
        siteUrl: 'https://cheapestgo.test',
        send: vi.fn(async () => {}),
        record: vi.fn(async () => {}),
        ...over,
    };
}

describe('the doorbell rings once per waiting spell', () => {
    afterAll(async () => {
        if (!process.env.DATABASE_URL) return;
        const db = await sql();
        for (const id of createdConversations) {
            await db`DELETE FROM support_conversations WHERE id = ${id}`.catch(() => {});
        }
        for (const id of createdUsers) {
            await db`DELETE FROM users WHERE id = ${id}`.catch(() => {});
        }
    });

    it('rings on the customer first message into an unassigned waiting conversation', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        const { notifyWaitingCustomer } = await import('./notify');
        const conversationId = await makeWaitingConversation(await makeUser());
        const deps = fakeDeps();

        await notifyWaitingCustomer(conversationId, deps);

        expect(deps.send).toHaveBeenCalledTimes(1);
        expect(deps.send).toHaveBeenCalledWith(
            expect.objectContaining({ to: 'support@cheapestgo.test' }),
        );
        expect(deps.record).toHaveBeenCalledWith(
            expect.objectContaining({ status: 'sent', conversationId }),
        );
    });

    it('stays quiet on the customer second message, because nothing changed', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        // One customer with a question in three parts is one customer waiting. The team
        // was already told; telling them again is noise that trains them to filter it.
        const { notifyWaitingCustomer } = await import('./notify');
        const conversationId = await makeWaitingConversation(await makeUser());

        const first = fakeDeps();
        await notifyWaitingCustomer(conversationId, first);
        expect(first.send).toHaveBeenCalledTimes(1);

        const second = fakeDeps();
        await notifyWaitingCustomer(conversationId, second);

        expect(second.send).not.toHaveBeenCalled();
        expect(second.record).not.toHaveBeenCalled();
    });

    it('rings once when two messages arrive at the same instant', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        // Sending two lines a few milliseconds apart is the ordinary way people type, and
        // the two requests need not even be on the same instance — so nothing in this
        // process can settle it. Reading the column, deciding, and then writing would let
        // both see NULL and both conclude they were first. Only the UPDATE can decide.
        const { notifyWaitingCustomer } = await import('./notify');
        const conversationId = await makeWaitingConversation(await makeUser());

        const first = fakeDeps();
        const second = fakeDeps();
        await Promise.all([
            notifyWaitingCustomer(conversationId, first),
            notifyWaitingCustomer(conversationId, second),
        ]);

        const rings =
            vi.mocked(first.send).mock.calls.length + vi.mocked(second.send).mock.calls.length;
        expect(rings).toBe(1);
    });

    it('rings again when a resolved conversation is reopened by the customer', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        // Resolved is not an ending. Someone who comes back weeks later with a new
        // question is a customer nobody is coming to, and the queue is the only place
        // that shows it — so the reopen has to undo the mark the first spell left.
        const { notifyWaitingCustomer } = await import('./notify');
        const { reopenIfResolved } = await import('./inbox');
        const db = await sql();
        const conversationId = await makeWaitingConversation(await makeUser());

        await notifyWaitingCustomer(conversationId, fakeDeps());
        await db`UPDATE support_conversations SET status = 'resolved' WHERE id = ${conversationId}`;

        expect(await reopenIfResolved(conversationId)).toBe(true);

        const again = fakeDeps();
        await notifyWaitingCustomer(conversationId, again);

        expect(again.send).toHaveBeenCalledTimes(1);
    });

    it('rings again when the widget reopens a resolved conversation on open', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        // The other way back in: the panel opens before the customer types, and
        // `openConversation` revives the resolved row it finds. Both reopens clear the
        // mark, or which door the customer came through would decide whether anyone knew.
        const { notifyWaitingCustomer } = await import('./notify');
        const { openConversation } = await import('./conversations');
        const db = await sql();
        const userId = await makeUser();
        const conversationId = await makeWaitingConversation(userId);

        await notifyWaitingCustomer(conversationId, fakeDeps());
        await db`UPDATE support_conversations SET status = 'resolved' WHERE id = ${conversationId}`;

        const reopened = await openConversation({ caller: { userId, guestToken: null }, locale: 'en' });
        expect(reopened.conversation.id).toBe(conversationId);

        const again = fakeDeps();
        await notifyWaitingCustomer(conversationId, again);

        expect(again.send).toHaveBeenCalledTimes(1);
    });

    it('stays quiet once an agent owns the conversation', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        // Somebody is already dealing with it. A doorbell for a customer who has an Agent
        // typing to them is telling the team about work that is already being done.
        const { notifyWaitingCustomer } = await import('./notify');
        const db = await sql();
        const agentId = await makeUser();
        const conversationId = await makeWaitingConversation(await makeUser());
        await db`
            UPDATE support_conversations
               SET assigned_admin_id = ${agentId}, status = 'human_active'
             WHERE id = ${conversationId}
        `;

        const deps = fakeDeps();
        await notifyWaitingCustomer(conversationId, deps);

        expect(deps.send).not.toHaveBeenCalled();
    });

    it('does not spend the ring when no address is configured', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        // A deployment that has not said who is on duty has not decided *not* to be told.
        // Marking the conversation rung would mean that once SUPPORT_NOTIFY_EMAIL is set,
        // every customer already in the queue stays invisible forever.
        const { notifyWaitingCustomer } = await import('./notify');
        const conversationId = await makeWaitingConversation(await makeUser());

        await notifyWaitingCustomer(conversationId, fakeDeps({ address: null }));

        const configured = fakeDeps();
        await notifyWaitingCustomer(conversationId, configured);

        expect(configured.send).toHaveBeenCalledTimes(1);
    });
});
