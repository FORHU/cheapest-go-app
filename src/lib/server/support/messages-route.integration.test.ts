import { describe, it, expect, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * A customer writing into a chat that was resolved while their panel was still open.
 *
 * A resolved chat is finished (CONTEXT.md, "Support Chat"): the message must start a new
 * conversation, with its own reference, in the queue a person watches — never reopen the old
 * one, and never reach a model (ADR-0031).
 *
 * The caller's identity is mocked rather than a whole Lucia session — the thing under test
 * is what the route does with the message, not whether a session can be faked convincingly —
 * but the message, the new conversation and the status reads are all real Postgres.
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

const createdUsers: string[] = [];

async function makeCustomer(): Promise<string> {
    const db = await sql();
    const rows = await db<{ id: string }[]>`
        INSERT INTO users (email, role)
        VALUES (${`messages-route-test-${crypto.randomUUID()}@example.com`}, 'user')
        RETURNING id
    `;
    createdUsers.push(rows[0].id);
    return rows[0].id;
}

afterEach(async () => {
    vi.mocked(getSession).mockReset();
    if (!process.env.DATABASE_URL) return;
    const db = await sql();
    if (createdUsers.length) {
        // Conversations first: users.id is ON DELETE SET NULL and a chat needs an owner.
        await db`DELETE FROM support_conversations WHERE user_id = ANY(${db.array(createdUsers)}::uuid[])`;
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
    it('starts a new chat instead of reopening a resolved one, and never involves a model', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        const db = await sql();
        const userId = await makeCustomer();
        const [old] = await db<{ id: string; reference: string }[]>`
            INSERT INTO support_conversations (user_id, source_brand, locale, status)
            VALUES (${userId}, 'CheapestGo', 'en', 'resolved')
            RETURNING id, reference
        `;

        vi.mocked(getSession).mockResolvedValue({
            user: { id: userId, email: 'customer@example.com', role: 'user' },
            session: { id: 'test-session' },
        } as never);

        const res = await postMessage('A new question, please.');
        expect(res.status).toBe(201);
        const data = await res.json();

        // The widget is told, so it can switch to the new chat and its reference.
        expect(data.started).toBe(true);
        expect(data.conversation.reference).not.toBe(old.reference);

        const rows = await db<{ id: string; status: string; guest: number; ai: number }[]>`
            SELECT c.id, c.status,
                   count(*) FILTER (WHERE m.sender_type = 'guest')::int AS guest,
                   count(*) FILTER (WHERE m.sender_type = 'ai')::int AS ai
              FROM support_conversations c LEFT JOIN support_messages m ON m.conversation_id = c.id
             WHERE c.user_id = ${userId}
             GROUP BY c.id, c.status
        `;
        const oldRow = rows.find(r => r.id === old.id)!;
        const newRow = rows.find(r => r.id === data.conversation.id)!;

        // The finished chat stays finished and untouched.
        expect(oldRow).toMatchObject({ status: 'resolved', guest: 0 });
        // The message is in the new one, queued for a person, and no model ran.
        expect(newRow).toMatchObject({ status: 'waiting_human', guest: 1, ai: 0 });
    });
});
