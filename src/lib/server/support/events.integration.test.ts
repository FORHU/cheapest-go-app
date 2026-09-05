import { describe, it, expect, afterAll } from 'vitest';
import { publish, resetSupportEvents, subscribe, type SupportEvent } from './events';

/**
 * The one thing about support chat that cannot be established by reading the code: that a
 * message published on one database connection actually reaches a listener on another.
 *
 * This is the mechanism standing in for the shared memory the app does not have — two EC2
 * instances, one RDS (ADR-0005). An in-process EventEmitter would pass every unit test and
 * still drop every cross-instance message in production, so the assertion has to involve a
 * real Postgres.
 *
 * Skips when no database is reachable, so it does not turn a green suite red on a machine
 * with no Docker running.
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

/** Resolves on the first event, or rejects rather than hanging the suite. */
function nextEvent(within = 5000): { promise: Promise<SupportEvent>; handler: (e: SupportEvent) => void } {
    let resolve!: (event: SupportEvent) => void;
    let reject!: (err: Error) => void;
    const promise = new Promise<SupportEvent>((res, rej) => { resolve = res; reject = rej; });
    const timer = setTimeout(() => reject(new Error('no event within timeout')), within);
    return {
        promise,
        handler: (event: SupportEvent) => { clearTimeout(timer); resolve(event); },
    };
}

const uuid = () => crypto.randomUUID();

describe('support event fanout over Postgres LISTEN/NOTIFY', () => {
    afterAll(async () => {
        await resetSupportEvents();
        if (process.env.DATABASE_URL) {
            const { getSqlAdmin } = await import('@/lib/db/postgres');
            await getSqlAdmin().end({ timeout: 1 }).catch(() => {});
        }
    });

    it('delivers a published event to a subscriber on another connection', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        const conversationId = uuid();
        const messageId = uuid();
        const { promise, handler } = nextEvent();

        const unsubscribe = await subscribe(conversationId, handler);
        await publish({ conversationId, messageId });

        await expect(promise).resolves.toEqual({ conversationId, messageId });
        unsubscribe();
    }, 20_000);

    it('delivers only to the conversation it belongs to', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        const mine = uuid();
        const theirs = uuid();
        const messageId = uuid();

        const wrong: SupportEvent[] = [];
        const unsubscribeTheirs = await subscribe(theirs, e => wrong.push(e));

        const { promise, handler } = nextEvent();
        const unsubscribeMine = await subscribe(mine, handler);

        await publish({ conversationId: mine, messageId });
        await expect(promise).resolves.toEqual({ conversationId: mine, messageId });

        // Same delivery, so by the time ours arrived theirs would have too.
        expect(wrong).toEqual([]);

        unsubscribeMine();
        unsubscribeTheirs();
    }, 20_000);

    it('delivers to a subscriber watching every conversation, as the agent inbox does', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        const conversationId = uuid();
        const messageId = uuid();
        const { promise, handler } = nextEvent();

        const unsubscribe = await subscribe(null, handler);
        await publish({ conversationId, messageId });

        await expect(promise).resolves.toEqual({ conversationId, messageId });
        unsubscribe();
    }, 20_000);

    it('stops delivering once unsubscribed, so a closed stream stops being written to', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        const conversationId = uuid();
        const seen: SupportEvent[] = [];

        const unsubscribe = await subscribe(conversationId, e => seen.push(e));
        unsubscribe();

        await publish({ conversationId, messageId: uuid() });

        // Give the notify time to arrive before concluding it did not.
        const { promise, handler } = nextEvent(2000);
        const witness = await subscribe(conversationId, handler);
        await publish({ conversationId, messageId: uuid() });
        await promise;
        witness();

        expect(seen).toEqual([]);
    }, 20_000);
});
