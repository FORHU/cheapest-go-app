/**
 * Core PostgreSQL connection pool using postgres.js.
 *
 * Two connection modes:
 *   sql        — anon-equivalent, respects RLS via app.current_user_id session var
 *   sqlAdmin   — service-role equivalent, sets app.bypass_rls=true (server-only)
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

/** Standard connection — honours RLS via set_config('app.current_user_id', ...) */
export function getSql(): postgres.Sql {
    if (!_sql) {
        _sql = postgres(getConnectionString(), {
            max: 10,
            idle_timeout: 30,
            connect_timeout: 10,
            ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
            onnotice: () => {}, // suppress NOTICE messages
        });
    }
    return _sql;
}

/** Admin connection — bypasses RLS for service-role operations */
export function getSqlAdmin(): postgres.Sql {
    if (!_sqlAdmin) {
        _sqlAdmin = postgres(getConnectionString(), {
            max: 5,
            idle_timeout: 30,
            connect_timeout: 10,
            ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
            onnotice: () => {},
        });
    }
    return _sqlAdmin;
}

/**
 * Execute a query within a user-scoped transaction.
 * Sets app.current_user_id so RLS policies using our custom auth.uid() work.
 */
export async function withUserContext<T>(
    userId: string,
    fn: (sql: postgres.Sql) => Promise<T>,
): Promise<T> {
    const sql = getSql();
    return sql.begin(async (tx) => {
        // Set the session variable that our custom auth.uid() reads
        await tx`SELECT set_config('app.current_user_id', ${userId}, true)`;
        return fn(tx);
    });
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
