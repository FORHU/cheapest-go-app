/**
 * Server-side PostgreSQL client — drop-in replacement for
 * src/utils/supabase/server.ts
 *
 * Existing code that imports from '@/utils/supabase/server' can be
 * redirected here by updating the path alias in tsconfig.json or
 * replacing imports file-by-file.
 *
 * Returns a DbClient that implements the Supabase query-builder interface.
 * Queries run under the current user's RLS context (app.current_user_id
 * is set by the request middleware or withUserContext()).
 */

import { getSql } from '@/lib/db/postgres';
import { DbClient } from '@/lib/db/query-builder';

/**
 * Create a database client for server components and API routes.
 * This is a synchronous factory (unlike the Supabase version which was async)
 * because postgres.js manages its own connection pool.
 */
export function createClient(): DbClient {
    return new DbClient(getSql());
}

// Re-export the type for callers that destructure AuthResult
export type { DbResult } from '@/lib/db/query-builder';
