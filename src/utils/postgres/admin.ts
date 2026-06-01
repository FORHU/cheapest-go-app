/**
 * Admin / service-role database client — drop-in replacement for
 * src/utils/supabase/admin.ts
 *
 * Uses the same connection pool as the standard client but bypasses
 * RLS by connecting without setting app.current_user_id.
 * Equivalent to Supabase service role key — SERVER ONLY, never import in client code.
 */

import { getSqlAdmin } from '@/lib/db/postgres';
import { DbClient } from '@/lib/db/query-builder';

export function createAdminClient(): DbClient {
    return new DbClient(getSqlAdmin());
}
