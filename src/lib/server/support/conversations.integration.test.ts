import { describe, it, expect, afterAll } from 'vitest';

/**
 * The status a conversation is born into, and the status it returns to when it is picked
 * back up.
 *
 * ADR-0031 retires the assistant: nobody answers a Support Chat but an Agent, so a
 * conversation is Waiting from its first message. `ai_active` no longer describes any
 * state the app can be in — it is residue on old rows, not a status anything writes.
 *
 * Integration rather than unit tests because neither answer lives in TypeScript. Creation
 * writes no status at all and takes the column DEFAULT, and the reopen is a conditional
 * UPDATE; a fake store would assert whatever the fake was told to say and would have gone
 * on passing while every real row came back `ai_active`.
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

/** A signed-in customer to open a conversation as. */
async function makeUser(): Promise<string> {
    const db = await sql();
    const rows = await db<{ id: string }[]>`
        INSERT INTO users (email) VALUES (${`support-status-${crypto.randomUUID()}@example.test`})
        RETURNING id
    `;
    createdUsers.push(rows[0].id);
    return rows[0].id;
}

async function statusOf(id: string): Promise<string> {
    const db = await sql();
    const rows = await db<{ status: string }[]>`
        SELECT status FROM support_conversations WHERE id = ${id}
    `;
    return rows[0]?.status ?? 'gone';
}

async function resolve(id: string): Promise<void> {
    const db = await sql();
    await db`UPDATE support_conversations SET status = 'resolved' WHERE id = ${id}`;
}

describe('a support conversation waits for a person from birth', () => {
    afterAll(async () => {
        if (!process.env.DATABASE_URL) return;
        const db = await sql();
        for (const id of createdConversations) {
            await db`DELETE FROM support_conversations WHERE id = ${id}`.catch(() => {});
        }
        for (const id of createdUsers) {
            await db`DELETE FROM users WHERE id = ${id}`.catch(() => {});
        }
        await db.end({ timeout: 1 }).catch(() => {});
    });

    it('opens a new conversation already waiting for a person', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        const { openConversation } = await import('./conversations');
        const userId = await makeUser();

        const { conversation, created } = await openConversation({
            caller: { userId, guestToken: null },
            locale: 'en',
        });
        createdConversations.push(conversation.id);

        expect(created).toBe(true);
        expect(conversation.status).toBe('waiting_human');
        expect(await statusOf(conversation.id)).toBe('waiting_human');
    });

    it('returns a reopened conversation to the queue rather than to the assistant', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        // A customer writing into a chat an Agent had marked done. There is no assistant
        // to hand it to any more, so reopening it means queueing it.
        const { openConversation } = await import('./conversations');
        const userId = await makeUser();

        const first = await openConversation({ caller: { userId, guestToken: null }, locale: 'en' });
        createdConversations.push(first.conversation.id);
        await resolve(first.conversation.id);

        const again = await openConversation({ caller: { userId, guestToken: null }, locale: 'en' });

        expect(again.created).toBe(false);
        expect(again.conversation.id).toBe(first.conversation.id);
        expect(again.conversation.status).toBe('waiting_human');
        expect(await statusOf(first.conversation.id)).toBe('waiting_human');
    });
});
