/**
 * Server-side PostgreSQL client.
 *
 * Returns a DbClient that implements the query-builder interface.
 * Queries run under the current user's RLS context (app.current_user_id
 * is set by the request middleware or withUserContext()).
 */

import { getSql } from '@/lib/db/postgres';
import { DbClient } from '@/lib/db/query-builder';

/**
 * Create a database client for server components and API routes.
 * Synchronous factory — postgres.js manages its own connection pool.
 */
export function createClient(): DbClient {
    return new DbClient(getSql());
}

// Re-export the type for callers that destructure AuthResult
export type { DbResult } from '@/lib/db/query-builder';
