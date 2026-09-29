/**
 * Core PostgreSQL connection pool using postgres.js.
 *
 * There is no Row Level Security — the database has no RLS policies and is
 * not publicly reachable. Access control is enforced at the API layer: every
 * route validates the session before querying. sql and sqlAdmin are both
 * full-access connections; sqlAdmin exists only as a separate pool for
 * admin/service-style operations, not as a privilege boundary.
 *
 * DATABASE_URL format:
 *   postgresql://user:password@host:5432/database?sslmode=require
 *
 * Set DATABASE_URL and DATABASE_URL_UNPOOLED in env (unpooled for migrations).
 */

import postgres from 'postgres';

// Lazy singleton — one pool per process
let _sql: postgres.Sql | null = null;
let _sqlAdmin: postgres.Sql | null = null;

function getConnectionString(pooled = true): string {
    const url = pooled
        ? process.env.DATABASE_URL
        : process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

    if (!url) {
        throw new Error(
            'DATABASE_URL is not set. Add it to your environment variables.\n' +
            'Format: postgresql://user:password@host:5432/database'
        );
    }
    return url;
}

function sslOption(): false | undefined {
    // 'false' → explicitly disable SSL (local dev)
    // anything else → omit the option so the URL's sslmode=require drives SSL
    return process.env.DATABASE_SSL === 'false' ? false : undefined;
}

/** Standard connection pool used by API routes and server components. */
export function getSql(): postgres.Sql {
    if (!_sql) {
        const ssl = sslOption();
        _sql = postgres(getConnectionString(), {
            max: 10,
            idle_timeout: 10,
            connect_timeout: 10,
            ...(ssl !== undefined ? { ssl } : {}),
            onnotice: () => {},
        });
    }
    return _sql;
}

/** Columns the app adds to tables it does not own a migration for. */
const STARTUP_COLUMNS: { table: string; column: string; ddl: string }[] = [
    { table: 'tgx_destination_cache', column: 'dest_type', ddl: `ALTER TABLE public.tgx_destination_cache ADD COLUMN IF NOT EXISTS dest_type text DEFAULT 'CITY'` },
    { table: 'tgx_destination_cache', column: 'parent_code', ddl: `ALTER TABLE public.tgx_destination_cache ADD COLUMN IF NOT EXISTS parent_code text` },
    { table: 'hotel_content', column: 'contact_info', ddl: `ALTER TABLE public.hotel_content ADD COLUMN IF NOT EXISTS contact_info jsonb` },
    { table: 'hotel_content', column: 'chain_code', ddl: `ALTER TABLE public.hotel_content ADD COLUMN IF NOT EXISTS chain_code text` },
    { table: 'hotel_content', column: 'giata_id', ddl: `ALTER TABLE public.hotel_content ADD COLUMN IF NOT EXISTS giata_id text` },
];

/**
 * Add only the columns that are actually missing, and never wait in line for the lock.
 *
 * `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` takes an ACCESS EXCLUSIVE lock *before* it
 * checks whether the column exists. These ran unconditionally on every process start, so
 * every deploy and restart queued for an exclusive lock on hotel_content and
 * tgx_destination_cache — and while a statement waits for that lock, Postgres queues every
 * later reader of the table behind it. On 2026-09-14 one such ALTER sat behind long-running
 * cron queries and froze reads of tgx_destination_cache, which every city search does.
 *
 * So: read information_schema first (no table lock), and when something really is missing,
 * give the ALTER a short lock_timeout — failing and retrying later is harmless; blocking
 * the site's searches is not.
 */
async function addMissingColumns(sql: postgres.Sql): Promise<void> {
    const existing = await sql<{ table_name: string; column_name: string }[]>`
        SELECT table_name, column_name FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name IN ('tgx_destination_cache', 'hotel_content')
    `;
    const have = new Set(existing.map(c => `${c.table_name}.${c.column_name}`));

    for (const col of STARTUP_COLUMNS) {
        if (have.has(`${col.table}.${col.column}`)) continue;
        // A table that does not exist in this database at all is not ours to alter here.
        if (!existing.some(c => c.table_name === col.table)) continue;
        await sql.begin(async tx => {
            await tx`SET LOCAL lock_timeout = '5s'`;
            await tx.unsafe(col.ddl);
        });
    }
}

// Run once per process — creates cache/stats tables that the deploy workflow
// never provisions (no migration step in CI). Safe to re-run: all DDL uses
// CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.
let _ensureTablesRan = false;
function ensureTablesOnce(sql: postgres.Sql): void {
    if (_ensureTablesRan) return;
    _ensureTablesRan = true;
    sql`
        CREATE TABLE IF NOT EXISTS public.hotel_search_cache (
            cache_key  text PRIMARY KEY,
            result     jsonb NOT NULL,
            created_at timestamptz NOT NULL DEFAULT now(),
            expires_at timestamptz NOT NULL
        )
    `.then(() => sql`
        CREATE INDEX IF NOT EXISTS idx_hotel_search_cache_expires
            ON public.hotel_search_cache (expires_at)
    `).then(() => sql`
        CREATE TABLE IF NOT EXISTS public.tgx_destination_cache (
            city_key         text PRIMARY KEY,
            destination_code text NOT NULL,
            created_at       timestamptz DEFAULT now()
        )
    `).then(() => sql`
        CREATE TABLE IF NOT EXISTS public.hotel_search_stats (
            city_key         text PRIMARY KEY,
            country_code     text NOT NULL DEFAULT '',
            search_count     int  NOT NULL DEFAULT 1,
            last_searched_at timestamptz NOT NULL DEFAULT now()
        )
    `).then(() => sql`
        CREATE TABLE IF NOT EXISTS public.tgx_failed_dest_codes (
            dest_code  text PRIMARY KEY,
            city_key   text NOT NULL DEFAULT '',
            created_at timestamptz NOT NULL DEFAULT now()
        )
    `).then(() => addMissingColumns(sql)).then(() => {
        // Name the host. A local dev server and the RDS-backed container are otherwise
        // indistinguishable from the outside, and picking the wrong one is how a test
        // booking becomes a real airline order.
        const dbHost = (process.env.DATABASE_URL ?? '').match(/@([^/:?]+)/)?.[1] ?? 'unknown';
        const isLocal = /^(localhost|127\.0\.0\.1|\[::1\]|postgres)$/.test(dbHost);
        console.log(`[db] startup tables OK — connected to ${dbHost} (${isLocal ? 'LOCAL' : 'REMOTE — bookings here are real'})`);
    }).catch((e: any) => {
        console.error('[db] ensureTables failed:', e.message);
        _ensureTablesRan = false; // allow retry on next request
    });
}

/** Admin connection — bypasses RLS for service-role operations */
export function getSqlAdmin(): postgres.Sql {
    if (!_sqlAdmin) {
        const ssl = sslOption();
        _sqlAdmin = postgres(getConnectionString(), {
            max: 5,
            idle_timeout: 10,
            connect_timeout: 10,
            ...(ssl !== undefined ? { ssl } : {}),
            onnotice: () => {},
        });
        ensureTablesOnce(_sqlAdmin);
    }
    return _sqlAdmin;
}

/**
 * Execute a raw SQL tagged template — use for migrations and one-offs.
 *
 * @example
 *   const rows = await query`SELECT * FROM profiles WHERE id = ${userId}`;
 */
export const query = getSql;

export type Sql = postgres.Sql;
export type Row = postgres.Row;
