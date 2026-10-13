import { describe, it, expect, afterEach } from 'vitest';

/**
 * The claim is what stops two paths buying two tickets for one booking, so it is tested against
 * a real database: the guarantee lives in what Postgres does with the UPDATE, not in our code.
 * Skips when no database is reachable, like its sibling *.integration.test.ts files.
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

const created: string[] = [];

async function db() {
    const { getSqlAdmin } = await import('@/lib/db/postgres');
    return getSqlAdmin();
}

async function makeSession(status: string, updatedAtAgoMinutes = 0): Promise<{ id: string; userId: string }> {
    const sql = await db();
    const [user] = await sql`SELECT id FROM users LIMIT 1`;
    const [row] = await sql`
        INSERT INTO booking_sessions (user_id, provider, status, expires_at, flight, updated_at)
        VALUES (${user.id}, 'duffel', ${status}, now() + interval '30 minutes',
                ${JSON.stringify({ _rawOffer: { id: 'off_int_1' } })}::jsonb,
                now() - make_interval(mins => ${updatedAtAgoMinutes}))
        RETURNING id`;
    created.push(row.id);
    return { id: row.id, userId: user.id };
}

afterEach(async () => {
    if (created.length) {
        const sql = await db();
        await sql`DELETE FROM booking_sessions WHERE id = ANY(${created})`;
        created.length = 0;
    }
});

describe('sqlSessionStore.claim', async () => {
    const reachable = await databaseReachable();
    const maybe = reachable ? it : it.skip;

    maybe('is taken once: the second claimer gets nothing', async () => {
        const { sqlSessionStore } = await import('./finalise-authorised');
        const store = sqlSessionStore(await db());
        const { id } = await makeSession('payment_initiated');

        const first = await store.claim(id, 8 * 60_000);
        const second = await store.claim(id, 8 * 60_000);

        expect(first?.id).toBe(id);
        expect(first?.previousClaimAt).toBeNull();
        expect(second).toBeNull();
    });

    maybe('is not taken over while the previous claim is recent', async () => {
        const { sqlSessionStore } = await import('./finalise-authorised');
        const store = sqlSessionStore(await db());
        const { id } = await makeSession('ordering', 2);

        expect(await store.claim(id, 8 * 60_000)).toBeNull();
    });

    maybe('is taken over once the previous claim is stale, and says when it began', async () => {
        const { sqlSessionStore } = await import('./finalise-authorised');
        const store = sqlSessionStore(await db());
        const { id } = await makeSession('ordering', 20);

        const taken = await store.claim(id, 8 * 60_000);

        expect(taken?.id).toBe(id);
        expect(taken?.previousClaimAt).not.toBeNull();
    });

    maybe('does not claim a session that is already booked or failed', async () => {
        const { sqlSessionStore } = await import('./finalise-authorised');
        const store = sqlSessionStore(await db());
        const booked = await makeSession('booked');
        const failed = await makeSession('failed');

        expect(await store.claim(booked.id, 8 * 60_000)).toBeNull();
        expect(await store.claim(failed.id, 8 * 60_000)).toBeNull();
    });

    maybe('hands back to payment_authorized when released', async () => {
        const { sqlSessionStore } = await import('./finalise-authorised');
        const sql = await db();
        const store = sqlSessionStore(sql);
        const { id } = await makeSession('payment_initiated');

        await store.claim(id, 8 * 60_000);
        await store.release(id);

        const [row] = await sql`SELECT status FROM booking_sessions WHERE id = ${id}`;
        expect(row.status).toBe('payment_authorized');
    });
});
