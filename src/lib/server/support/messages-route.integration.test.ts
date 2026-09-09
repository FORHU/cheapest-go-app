import { describe, it, expect, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * ADR-0031: no model answers a Support Chat any more, so `POST /api/support/conversation/
 * messages` must never hand a stored customer message to `startSupportTurn`.
 *
 * The only place in the app where that call could still fire is a customer writing into a
 * *resolved* conversation: fresh conversations are born `waiting_human` (a prior task), so
 * `conversation.status === 'ai_active'` is never true for one of those, and the sole
 * remaining trigger is the reopen this route runs through `inbox.reopenIfResolved`. That
 * makes this the route-level test for both halves of this task at once — it fails today
 * either because the model still gets invoked, or because the reopened conversation lands
 * on `ai_active` (the bug `inbox.integration.test.ts` covers directly) rather than
 * `waiting_human`.
 *
 * The caller's identity is mocked rather than a whole Lucia session — the thing under test
 * is what the route does with a stored message, not whether a session can be faked
 * convincingly — but the message, the reopen and the status read are all real Postgres.
 *
 * Skips silently without DATABASE_URL.
 */

vi.mock('next/headers', () => ({
    cookies: async () => ({
        get: () => undefined,
        set: () => {},
    }),
}));

vi.mock('@/lib/auth/session', () => ({
    getSession: vi.fn(),
}));

import { getSession } from '@/lib/auth/session';
import { POST } from '@/app/api/support/conversation/messages/route';

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

async function makeCustomer(): Promise<string> {
    const db = await sql();
    const rows = await db<{ id: string }[]>`
        INSERT INTO users (email, role)
        VALUES (${`messages-route-test-${crypto.randomUUID()}@example.com`}, 'user')
        RETURNING id
    `;
    return rows[0].id;
}

async function makeResolvedConversation(userId: string): Promise<string> {
    const db = await sql();
    const rows = await db<{ id: string }[]>`
        INSERT INTO support_conversations (user_id, source_brand, locale, status)
        VALUES (${userId}, 'CheapestGo', 'en', 'resolved')
        RETURNING id
    `;
    return rows[0].id;
}

async function statusOf(id: string): Promise<string> {
    const db = await sql();
    const rows = await db<{ status: string }[]>`
        SELECT status FROM support_conversations WHERE id = ${id}
    `;
    return rows[0]?.status ?? 'gone';
}

async function aiMessageCount(id: string): Promise<number> {
    const db = await sql();
    const rows = await db<{ count: string }[]>`
        SELECT count(*) FROM support_messages WHERE conversation_id = ${id} AND sender_type = 'ai'
    `;
    return Number(rows[0]?.count ?? 0);
}

const createdConversations: string[] = [];
const createdUsers: string[] = [];

afterEach(async () => {
    vi.mocked(getSession).mockReset();
    if (!process.env.DATABASE_URL) return;
    const db = await sql();
    if (createdConversations.length) {
        await db`DELETE FROM support_conversations WHERE id = ANY(${db.array(createdConversations)}::uuid[])`;
        createdConversations.length = 0;
    }
    if (createdUsers.length) {
        await db`DELETE FROM users WHERE id = ANY(${db.array(createdUsers)}::uuid[])`;
        createdUsers.length = 0;
    }
});

function postMessage(body: string) {
    const req = new NextRequest('https://cheapestgo.test/api/support/conversation/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body }),
    });
    return POST(req);
}

describe('POST /api/support/conversation/messages', () => {
    it('reopens a resolved conversation to a person, never to the model', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        const userId = await makeCustomer();
        createdUsers.push(userId);
        const conversationId = await makeResolvedConversation(userId);
        createdConversations.push(conversationId);

        vi.mocked(getSession).mockResolvedValue({
            user: { id: userId, email: 'customer@example.com', role: 'user' },
            session: { id: 'test-session' },
        } as never);

        const res = await postMessage('Are you still there?');
        expect(res.status).toBe(201);

        // No model ever ran a turn on this conversation.
        expect(await aiMessageCount(conversationId)).toBe(0);
        // Reopened into the queue a person watches, not into a status nothing answers.
        expect(await statusOf(conversationId)).toBe('waiting_human');
    });
});
