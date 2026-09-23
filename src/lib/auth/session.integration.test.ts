import { describe, it, expect, afterAll, vi } from 'vitest';

/**
 * The Idle Limit (CONTEXT.md, ADR-0027), enforced where it has to be: a real Postgres round
 * trip through Lucia's adapter, not a mock of it. `idle.test.ts` covers the minutes math in
 * isolation; what only a real database can prove is that `getSession()` actually reads
 * `last_active_at` back from the row this adapter writes, actually deletes the row once the
 * limit has passed, and does neither to a session that is still inside it.
 *
 * `next/headers` is mocked with a small stateful cookie jar — the thing under test is what
 * the server does with a session that exists, not whether a real browser cookie can be
 * faked convincingly.
 *
 * Skips silently without DATABASE_URL.
 */

let cookieJar = new Map<string, string>();

vi.mock('next/headers', () => ({
    cookies: async () => ({
        get: (name: string) => {
            const value = cookieJar.get(name);
            return value === undefined ? undefined : { name, value };
        },
        set: (name: string, value: string) => {
            cookieJar.set(name, value);
        },
    }),
}));

import { getSession, touchSessionPresence } from './session';

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

/** A throwaway user + session, backdated by `idleMinutesAgo` of Presence. */
async function makeIdleSession(role: 'user' | 'admin' | 'support_agent', idleMinutesAgo: number) {
    const { getSqlAdmin } = await import('@/lib/db/postgres');
    const sql = getSqlAdmin();
    const email = `idle-test-${crypto.randomUUID()}@example.com`;

    const [user] = await sql<{ id: string }[]>`
        INSERT INTO users (email, password_hash, role)
        VALUES (${email}, 'not-a-real-hash', ${role})
        RETURNING id
    `;

    const sessionId = `test-session-${crypto.randomUUID()}`;
    await sql`
        INSERT INTO sessions (id, user_id, expires_at, last_active_at)
        VALUES (
            ${sessionId},
            ${user.id},
            NOW() + INTERVAL '1 day',
            NOW() - (${idleMinutesAgo}::text || ' minutes')::interval
        )
    `;

    return { userId: user.id, sessionId };
}

async function sessionRowExists(sessionId: string): Promise<boolean> {
    const { getSqlAdmin } = await import('@/lib/db/postgres');
    const rows = await getSqlAdmin()<{ id: string }[]>`SELECT id FROM sessions WHERE id = ${sessionId}`;
    return rows.length > 0;
}

async function cleanup(userId: string) {
    const { getSqlAdmin } = await import('@/lib/db/postgres');
    await getSqlAdmin()`DELETE FROM users WHERE id = ${userId}`; // cascades to sessions
}

const SESSION_COOKIE = 'cg-session';

// One shared pool for the whole file (getSqlAdmin() is a singleton) — a per-describe
// afterAll here would close it after the first describe's tests and strand the rest of
// the file's databaseReachable() checks on a dead pool, which fails closed as "no
// database" and silently skips everything after it.
afterAll(async () => {
    if (!process.env.DATABASE_URL) return;
    const { getSqlAdmin } = await import('@/lib/db/postgres');
    await getSqlAdmin().end({ timeout: 1 }).catch(() => {});
});

describe('getSession — Idle Limit', () => {
    it('keeps a traveller signed in well inside the thirty-minute limit', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        const { userId, sessionId } = await makeIdleSession('user', 5);
        cookieJar = new Map([[SESSION_COOKIE, sessionId]]);

        try {
            const { user } = await getSession();
            expect(user?.id).toBe(userId);
            expect(await sessionRowExists(sessionId)).toBe(true);
        } finally {
            await cleanup(userId);
        }
    });

    it('signs a traveller out once thirty minutes have passed without Presence', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        const { userId, sessionId } = await makeIdleSession('user', 31);
        cookieJar = new Map([[SESSION_COOKIE, sessionId]]);

        try {
            const { session, user } = await getSession();
            expect(session).toBeNull();
            expect(user).toBeNull();
            // Enforced by the server (ADR-0027): the row is gone, not just ignored, so the
            // next request doesn't get to try again with a slightly newer clock.
            expect(await sessionRowExists(sessionId)).toBe(false);
        } finally {
            await cleanup(userId);
        }
    });

    it('signs staff out at eleven minutes, where a traveller would still be fine', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        const { userId, sessionId } = await makeIdleSession('support_agent', 11);
        cookieJar = new Map([[SESSION_COOKIE, sessionId]]);

        try {
            const { session, user } = await getSession();
            expect(session).toBeNull();
            expect(user).toBeNull();
        } finally {
            await cleanup(userId);
        }
    });

    it('keeps staff signed in at eight minutes', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        const { userId, sessionId } = await makeIdleSession('admin', 8);
        cookieJar = new Map([[SESSION_COOKIE, sessionId]]);

        try {
            const { user } = await getSession();
            expect(user?.id).toBe(userId);
        } finally {
            await cleanup(userId);
        }
    });
});

describe('touchSessionPresence', () => {
    it('records Presence, pulling a stale session back inside its Idle Limit', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        // Backdated far enough that, untouched, the traveller's next getSession() would
        // sign them out — this is the click that should stop that from happening.
        const { userId, sessionId } = await makeIdleSession('user', 45);

        try {
            await touchSessionPresence(sessionId);

            const { getSqlAdmin } = await import('@/lib/db/postgres');
            const [row] = await getSqlAdmin()<{ last_active_at: Date }[]>`
                SELECT last_active_at FROM sessions WHERE id = ${sessionId}
            `;
            expect(Date.now() - row.last_active_at.getTime()).toBeLessThan(5_000);
        } finally {
            await cleanup(userId);
        }
    });

    it('does nothing to a session that no longer exists, rather than throwing', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();
        await expect(touchSessionPresence(`no-such-session-${crypto.randomUUID()}`)).resolves.not.toThrow();
    });
});
