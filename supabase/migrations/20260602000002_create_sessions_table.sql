-- Migration: 20260602000002_create_sessions_table.sql
-- Lucia v3 session store. Replaces Supabase Auth session management.

CREATE TABLE IF NOT EXISTS public.sessions (
    id          TEXT        PRIMARY KEY,               -- Lucia-generated session ID
    user_id     UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    expires_at  TIMESTAMPTZ NOT NULL,
    attributes  JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id   ON public.sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON public.sessions(expires_at);

-- Automatic cleanup of expired sessions (called by pg_cron or Vercel Cron)
CREATE OR REPLACE FUNCTION public.cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted INTEGER;
BEGIN
    DELETE FROM public.sessions WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted = ROW_COUNT;
    RETURN deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS: Sessions are managed only by server-side service role (admin client).
-- Users cannot read or write sessions directly.
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct user access to sessions"
    ON public.sessions
    USING (FALSE);
