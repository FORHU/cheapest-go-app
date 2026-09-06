import { describe, it, expect, afterAll } from 'vitest';
import { claimTurn, releaseTurn, TURN_CLAIM_TIMEOUT_MS } from './turn';

/**
 * Only one model turn may run for a conversation at a time.
 *
 * This is the part that cannot be established by reading the code: the claim has to be
 * atomic against a real Postgres, because the race it prevents is two requests arriving
 * at the same instant — possibly at two different EC2 instances, which share nothing but
 * the database. A check-then-write in application code would pass every unit test and
 * still let both through.
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

/** A conversation to claim against, cleaned up by the caller. */
async function makeConversation(): Promise<string> {
    const { getSqlAdmin } = await import('@/lib/db/postgres');
    const rows = await getSqlAdmin()<{ id: string }[]>`
        INSERT INTO support_conversations (guest_token_hash, source_brand, locale)
        VALUES (${`test-${crypto.randomUUID()}`}, 'CheapestGo', 'en')
        RETURNING id
    `;
    return rows[0].id;
}

async function removeConversation(id: string): Promise<void> {
    const { getSqlAdmin } = await import('@/lib/db/postgres');
    await getSqlAdmin()`DELETE FROM support_conversations WHERE id = ${id}`;
}

/** Backdate the claim so it looks like a process that died mid-turn. */
async function ageClaim(id: string, byMs: number): Promise<void> {
    const { getSqlAdmin } = await import('@/lib/db/postgres');
    await getSqlAdmin()`
        UPDATE support_conversations
           SET ai_turn_started_at = now() - (${byMs}::text || ' milliseconds')::interval
         WHERE id = ${id}
    `;
}

describe('support turn claim', () => {
    afterAll(async () => {
        if (!process.env.DATABASE_URL) return;
        const { getSqlAdmin } = await import('@/lib/db/postgres');
        await getSqlAdmin().end({ timeout: 1 }).catch(() => {});
    });

    it('lets the first caller claim a conversation', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        const id = await makeConversation();
        try {
            expect(await claimTurn(id)).toBe(true);
        } finally {
            await removeConversation(id);
        }
    });

    it('refuses a second claim while the first is still running', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        const id = await makeConversation();
        try {
            expect(await claimTurn(id)).toBe(true);
            expect(await claimTurn(id)).toBe(false);
        } finally {
            await removeConversation(id);
        }
    });

    it('lets exactly one of several simultaneous claims through', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        // The real race: three messages sent at once, possibly at two instances. The
        // conditional UPDATE is what makes this one winner rather than three.
        const id = await makeConversation();
        try {
            const results = await Promise.all([claimTurn(id), claimTurn(id), claimTurn(id)]);
            expect(results.filter(Boolean)).toHaveLength(1);
        } finally {
            await removeConversation(id);
        }
    });

    it('can be claimed again once released', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        const id = await makeConversation();
        try {
            expect(await claimTurn(id)).toBe(true);
            await releaseTurn(id);
            expect(await claimTurn(id)).toBe(true);
        } finally {
            await removeConversation(id);
        }
    });

    it('takes over a claim left behind by a process that died', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        // Without expiry, one crash mid-turn silences a conversation permanently.
        const id = await makeConversation();
        try {
            expect(await claimTurn(id)).toBe(true);
            await ageClaim(id, TURN_CLAIM_TIMEOUT_MS + 1000);
            expect(await claimTurn(id)).toBe(true);
        } finally {
            await removeConversation(id);
        }
    });

    it('does not take over a claim that is merely slow', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        const id = await makeConversation();
        try {
            expect(await claimTurn(id)).toBe(true);
            await ageClaim(id, TURN_CLAIM_TIMEOUT_MS - 5000);
            expect(await claimTurn(id)).toBe(false);
        } finally {
            await removeConversation(id);
        }
    });
});
