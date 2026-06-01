-- Migration: 20260601000003_fix_profiles_rls.sql
-- The original SELECT policy used USING (true), meaning any unauthenticated
-- request could read all profiles including the role field (admin/user).
-- This exposed admin account identities and provided an enumeration surface.
--
-- Server-side code (Next.js API routes, Edge Functions) all use the service role
-- key which bypasses RLS — these are unaffected by this change.
-- Client-side code only ever reads the current user's own profile.

DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;

-- Users may only read their own profile row
CREATE POLICY "Users can view own profile"
    ON profiles FOR SELECT
    USING (auth.uid() = id);

-- Admins can read all profiles (needed for admin dashboard user management)
-- Uses the service role in practice, but this policy covers anon admin sessions
CREATE POLICY "Admins can view all profiles"
    ON profiles FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles self
            WHERE self.id = auth.uid()
              AND self.role = 'admin'
        )
    );
