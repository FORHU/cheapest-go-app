import { describe, it, expect, afterAll, vi } from 'vitest';

/**
 * POST /api/auth/presence — the write side of the Idle Limit (CONTEXT.md, ADR-0027).
 *
 * This is the one route allowed to call `touchSessionPresence`, and only the client's own
 * throttled activity listener is meant to call it (see `useIdlePresence`) — never routine
 * polling, which is exactly what the Idle Limit exists to see through.
 *
 * The route must not let a ping resurrect a session already past its limit: it goes through
 * `getSession()` first, which judges the request against the *previous* `last_active_at`,
 * before this route would get a chance to overwrite it. Proving that ordering needs a real
 * session row and a real clock, so this is an integration test, not a mock of getSession().
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

import { POST } from './route';

const SESSION_COOKIE = 'cg-session';

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

async function makeIdleSession(idleMinutesAgo: number) {
    const { getSqlAdmin } = await import('@/lib/db/postgres');
    const sql = getSqlAdmin();
    const email = `presence-test-${crypto.randomUUID()}@example.com`;

    const [user] = await sql<{ id: string }[]>`
        INSERT INTO users (email, password_hash, role)
        VALUES (${email}, 'not-a-real-hash', 'user')
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

async function cleanup(userId: string) {
    const { getSqlAdmin } = await import('@/lib/db/postgres');
    await getSqlAdmin()`DELETE FROM users WHERE id = ${userId}`; // cascades to sessions
}

afterAll(async () => {
    if (!process.env.DATABASE_URL) return;
    const { getSqlAdmin } = await import('@/lib/db/postgres');
    await getSqlAdmin().end({ timeout: 1 }).catch(() => {});
});

describe('POST /api/auth/presence', () => {
    it('rejects a request with no session cookie', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();
        cookieJar = new Map();

        const res = await POST();
        expect(res.status).toBe(401);
    });

    it('bumps last_active_at for a session still inside its Idle Limit', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        const { userId, sessionId } = await makeIdleSession(20); // inside the 30-minute limit
        cookieJar = new Map([[SESSION_COOKIE, sessionId]]);

        try {
            const res = await POST();
            expect(res.status).toBe(200);

            const { getSqlAdmin } = await import('@/lib/db/postgres');
            const [row] = await getSqlAdmin()<{ last_active_at: Date }[]>`
                SELECT last_active_at FROM sessions WHERE id = ${sessionId}
            `;
            expect(Date.now() - row.last_active_at.getTime()).toBeLessThan(5_000);
        } finally {
            await cleanup(userId);
        }
    });

    it('refuses to revive a session already past its Idle Limit', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        const { userId, sessionId } = await makeIdleSession(31); // past the 30-minute limit
        cookieJar = new Map([[SESSION_COOKIE, sessionId]]);

        try {
            const res = await POST();
            expect(res.status).toBe(401);

            // Not just refused — actually gone, same as any other idle-expired session.
            const { getSqlAdmin } = await import('@/lib/db/postgres');
            const rows = await getSqlAdmin()<{ id: string }[]>`SELECT id FROM sessions WHERE id = ${sessionId}`;
            expect(rows).toHaveLength(0);
        } finally {
            await cleanup(userId);
        }
    });
});
