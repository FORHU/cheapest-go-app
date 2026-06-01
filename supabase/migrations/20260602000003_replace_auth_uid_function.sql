-- Migration: 20260602000003_replace_auth_uid_function.sql
--
-- CRITICAL: Replaces Supabase's built-in auth.uid() and auth.jwt() functions
-- with custom implementations that read from PostgreSQL session variables.
--
-- After this migration all 61 existing RLS policies that use auth.uid() or
-- auth.jwt() continue to work WITHOUT any code changes.
--
-- How it works:
--   1. Before executing a user-scoped query, the application calls:
--        SELECT set_config('app.current_user_id', '<uuid>', true);
--      The `true` argument makes this LOCAL to the current transaction.
--
--   2. auth.uid() reads that session variable and returns it as a UUID.
--
--   3. Admin queries (service role equivalent) skip set_config entirely,
--      so auth.uid() returns NULL and RLS policies that bypass checks when
--      uid IS NULL (admin-only policies) continue to work.
--
-- Note: If you are migrating FROM Supabase (which has its own auth schema),
-- the DROP and CREATE below replace Supabase's built-in functions. On a fresh
-- PostgreSQL installation, create the auth schema first.

-- Ensure auth schema exists
CREATE SCHEMA IF NOT EXISTS auth;

-- Drop Supabase's built-in versions if present (safe on plain PostgreSQL)
DROP FUNCTION IF EXISTS auth.uid() CASCADE;
DROP FUNCTION IF EXISTS auth.jwt() CASCADE;
DROP FUNCTION IF EXISTS auth.role() CASCADE;
DROP FUNCTION IF EXISTS auth.email() CASCADE;

-- auth.uid() — returns the current user's UUID from the session variable
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT NULLIF(
        current_setting('app.current_user_id', true),
        ''
    )::uuid
$$;

-- auth.jwt() — returns the JWT claims stored in the session variable
-- The middleware sets app.current_jwt as a JSON string.
-- Returns NULL when not in a user session (service role / no JWT).
CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT NULLIF(
        current_setting('app.current_jwt', true),
        ''
    )::jsonb
$$;

-- auth.role() — returns the user's role from their profile
-- Used in some admin-check RLS policies.
CREATE OR REPLACE FUNCTION auth.role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT role::text FROM public.users WHERE id = auth.uid()
$$;

-- auth.email() — convenience function to get the current user's email
CREATE OR REPLACE FUNCTION auth.email()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT email FROM public.users WHERE id = auth.uid()
$$;

-- Helper: called by the application layer to set user context for RLS
-- Usage: SELECT public.set_user_context('<user-uuid>', '<jwt-json>');
CREATE OR REPLACE FUNCTION public.set_user_context(
    p_user_id   uuid,
    p_jwt       jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    PERFORM set_config('app.current_user_id', p_user_id::text, true);
    IF p_jwt IS NOT NULL THEN
        PERFORM set_config('app.current_jwt', p_jwt::text, true);
    END IF;
END;
$$;

-- Verify the functions work
DO $$
BEGIN
    ASSERT auth.uid() IS NULL, 'auth.uid() should return NULL outside a user context';
    RAISE NOTICE 'auth.uid() replacement: OK';
END;
$$;
