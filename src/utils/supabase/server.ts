/**
 * Compatibility shim — redirects to the new postgres client.
 *
 * Files that import createClient from '@/utils/supabase/server' now
 * transparently get the postgres.js-based DbClient without any code changes.
 *
 * The original Supabase SSR implementation has been replaced by
 * src/utils/postgres/server.ts which uses postgres.js directly.
 */
export { createClient } from '@/utils/postgres/server';
