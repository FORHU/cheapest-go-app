/**
 * Admin / service-role database client.
 *
 * Uses the same connection pool as the standard client but bypasses
 * RLS by connecting without setting app.current_user_id.
 * SERVER ONLY — never import in client code.
 */

import { getSqlAdmin } from '@/lib/db/postgres';
import { DbClient } from '@/lib/db/query-builder';

export function createAdminClient(): DbClient {
    return new DbClient(getSqlAdmin());
}
