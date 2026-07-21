/**
 * Browser-side database client stub — drop-in replacement for
 * src/utils/supabase/client.ts
 *
 * Browser code MUST NOT talk directly to PostgreSQL.
 * Any "client" queries should go through Next.js API routes.
 *
 * This stub exists so imports don't break during incremental migration.
 * Real data fetching should use fetch() to API routes or React Query.
 *
 * Auth operations (signIn, signOut, getUser) are handled by
 * src/lib/auth/client.ts which hits /api/auth/* routes.
 */

export function createClient() {
    if (typeof window === 'undefined') {
        // Server-side: return the real postgres client
         
        const { createClient: serverCreate } = require('@/utils/postgres/server');
        return serverCreate();
    }

    // Client-side: throw to catch accidental direct DB usage in the browser
    throw new Error(
        'Direct database access is not allowed in the browser. ' +
        'Use API routes (/api/*) or server actions instead.',
    );
}
