import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import { getSupportHours, saveSupportHours, SUPPORT_HOURS_KEY } from './availability';
import { DEFAULT_SUPPORT_HOURS } from './hours';

/**
 * Reading and writing the schedule against a real `admin_settings`.
 *
 * The validator is unit-tested; what is not covered anywhere else is the round trip — that
 * what comes back out is what went in. The value is jsonb, and postgres.js has bitten this
 * codebase before by handing back a JSON *string* where an object was expected (there is a
 * comment about exactly that in `getAdminSettings`). A schedule that survives validation
 * and then reads back as a string would silently fall back to the default hours.
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

/**
 * Whatever schedule was configured before this file ran.
 *
 * These tests write to the one row the running deployment actually reads, so they put it
 * back. Deleting it instead would silently reset a real support schedule to the defaults
 * every time the suite runs — a test that quietly changes when the desk is open.
 */
let original: unknown = undefined;
let captured = false;

async function clearHours() {
    const { getSqlAdmin } = await import('@/lib/db/postgres');
    const sql = getSqlAdmin();

    if (!captured) {
        const rows = await sql<{ value: unknown }[]>`
            SELECT value FROM admin_settings WHERE key = ${SUPPORT_HOURS_KEY}
        `;
        original = rows[0]?.value;
        captured = true;
    }

    await sql`DELETE FROM admin_settings WHERE key = ${SUPPORT_HOURS_KEY}`;
}

async function restoreHours() {
    if (!captured || original === undefined) return;
    const { getSqlAdmin } = await import('@/lib/db/postgres');
    const sql = getSqlAdmin();
    // `sql.json`, not JSON.stringify — the same trap the code under test fell into.
    await sql`
        INSERT INTO admin_settings (key, value)
        VALUES (${SUPPORT_HOURS_KEY}, ${sql.json(original as Parameters<typeof sql.json>[0])})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `;
}

beforeEach(async () => {
    if (!(await databaseReachable())) return;
    await clearHours();
});

afterAll(async () => {
    if (!process.env.DATABASE_URL) return;
    await clearHours().catch(() => {});
    await restoreHours();
    const { getSqlAdmin } = await import('@/lib/db/postgres');
    await getSqlAdmin().end({ timeout: 1 }).catch(() => {});
});

const weekend = {
    timezone: 'Asia/Seoul',
    days: {
        mon: { open: '08:30', close: '17:30' },
        tue: null,
        wed: null,
        thu: null,
        fri: null,
        sat: { open: '10:00', close: '14:00' },
        sun: null,
    },
};

describe('saveSupportHours', () => {
    it('reads back exactly what was written', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        const result = await saveSupportHours(weekend);
        expect(result.ok).toBe(true);

        const stored = await getSupportHours();
        expect(stored.timezone).toBe('Asia/Seoul');
        expect(stored.days.mon).toEqual({ open: '08:30', close: '17:30' });
        expect(stored.days.sat).toEqual({ open: '10:00', close: '14:00' });
        expect(stored.days.tue).toBeNull();
    });

    it('replaces the previous schedule rather than merging with it', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        await saveSupportHours(weekend);
        await saveSupportHours({
            timezone: 'Asia/Manila',
            days: { mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null },
        });

        const stored = await getSupportHours();
        expect(stored.timezone).toBe('Asia/Manila');
        // Saturday cover is gone, not left over from the first write.
        expect(stored.days.sat).toBeNull();
    });

    it('writes nothing when the schedule is rejected', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        await saveSupportHours(weekend);
        const rejected = await saveSupportHours({ timezone: 'Mars/Olympus', days: {} });

        expect(rejected.ok).toBe(false);
        // The good schedule survives: a refused save must not clear what was there.
        expect((await getSupportHours()).timezone).toBe('Asia/Seoul');
    });

    it('stores a jsonb object, not a JSON string', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        // The round trip alone cannot catch this: `getSupportHours` defensively parses a
        // string, so a double-encoded write reads back fine and looks correct. Everything
        // else that touches the row does not — `value->'days'` returns nothing, the admin
        // settings reader sees a string, and a hand-written query silently finds no days.
        await saveSupportHours(weekend);

        const { getSqlAdmin } = await import('@/lib/db/postgres');
        const rows = await getSqlAdmin()<{ kind: string; saturday: unknown }[]>`
            SELECT jsonb_typeof(value) AS kind,
                   value -> 'days' -> 'sat' -> 'open' AS saturday
              FROM admin_settings
             WHERE key = ${SUPPORT_HOURS_KEY}
        `;

        expect(rows[0].kind).toBe('object');
        expect(rows[0].saturday).toBe('10:00');
    });

    it('falls back to the published hours when nothing is stored', async (ctx) => {
        if (!(await databaseReachable())) ctx.skip();

        expect(await getSupportHours()).toEqual(DEFAULT_SUPPORT_HOURS);
    });
});
