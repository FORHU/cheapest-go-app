/**
 * DEPRECATED — replaced by src/utils/postgres/middleware.ts
 * This file is no longer imported. Safe to delete after migration is verified.
 *
 * The new middleware uses Lucia sessions stored in PostgreSQL instead of
 * Supabase Auth cookies. No @supabase/ssr dependency.
 */
export { updateSession } from '@/utils/postgres/middleware';
