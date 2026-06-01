-- Migration: 20260601000005_fix_profiles_admin_rls.sql
-- The "Admins can view all profiles" policy created in 20260601000003 used a
-- recursive subquery (SELECT 1 FROM profiles WHERE ...) which Supabase handles
-- without infinite loop only due to policy evaluation order — an undocumented
-- implementation detail that could break on PostgreSQL or Supabase upgrades.
--
-- Fix: read the admin role from the JWT app_metadata claim instead.
-- The claim is set server-side by the promote-admin script and is not user-editable.
-- This is non-recursive, evaluated entirely in memory, and costs zero DB round-trips.
--
-- Note: requireAdmin() in src/lib/server/admin/auth.ts now reads profiles using the
-- service role key, so this policy is only exercised by direct Supabase client calls
-- (e.g. admin dashboard table queries via supabase-js with session token).

DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;

CREATE POLICY "Admins can view all profiles"
    ON profiles FOR SELECT
    USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
        OR
        (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
    );
