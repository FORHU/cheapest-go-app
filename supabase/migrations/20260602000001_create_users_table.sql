-- Migration: 20260602000001_create_users_table.sql
-- Creates the public.users table that replaces auth.users.
-- Lucia uses this table for authentication; profiles remain a separate table
-- extended by the trigger below.

CREATE TABLE IF NOT EXISTS public.users (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT        NOT NULL UNIQUE,
    password_hash   TEXT,                          -- NULL for OAuth-only users
    role            TEXT        NOT NULL DEFAULT 'user'
                                CHECK (role IN ('user', 'admin')),
    first_name      TEXT,
    last_name       TEXT,
    avatar_url      TEXT,
    email_verified  BOOLEAN     NOT NULL DEFAULT FALSE,
    banned_at       TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at ON public.users;
CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION update_users_updated_at();

-- Create a profile row whenever a user is created (mirrors old auth.users trigger)
CREATE OR REPLACE FUNCTION public.handle_new_user_public()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, first_name, last_name, avatar_url, role)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.first_name,
        NEW.last_name,
        NEW.avatar_url,
        COALESCE(NEW.role::public.user_role, 'user'::public.user_role)
    )
    ON CONFLICT (id) DO UPDATE SET
        email      = EXCLUDED.email,
        first_name = EXCLUDED.first_name,
        last_name  = EXCLUDED.last_name,
        avatar_url = EXCLUDED.avatar_url,
        role       = EXCLUDED.role;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_public_user_created ON public.users;
CREATE TRIGGER on_public_user_created
    AFTER INSERT ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_public();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);

-- RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own record"
    ON public.users FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own record"
    ON public.users FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id AND role = (SELECT role FROM public.users WHERE id = auth.uid()));
