/**
 * Compatibility shim — redirects to the new postgres admin client.
 * All files importing createAdminClient from here get the postgres.js version.
 */
export { createAdminClient } from '@/utils/postgres/admin';
