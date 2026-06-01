/**
 * Compatibility shim for browser-side code.
 *
 * After migration, browser code must NOT talk to PostgreSQL directly.
 * Components that previously used supabase.channel() for realtime should
 * switch to polling the relevant API routes (e.g. /api/booking/list).
 *
 * This shim throws a clear error if someone tries to call createClient()
 * in the browser so migration gaps are caught immediately in development.
 *
 * Realtime subscriptions (TripsContent, useDashboardData) have been replaced
 * with API polling — see those files for the updated implementation.
 */

// Re-export the server client for server-component usage (same interface)
export { createClient } from '@/utils/postgres/server';
