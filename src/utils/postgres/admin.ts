/**
 * Admin / service-role database client.
 *
 * Uses a separate connection pool from the standard client. There is no
 * RLS to bypass — this exists to isolate admin/service-style operations
 * onto their own pool, not as a privilege boundary.
 * SERVER ONLY — never import in client code.
 */

import { getSqlAdmin } from '@/lib/db/postgres';
import { DbClient } from '@/lib/db/query-builder';

export function createAdminClient(): DbClient {
    return new DbClient(getSqlAdmin());
}
