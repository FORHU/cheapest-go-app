-- Migration: 20260602000005_password_reset_tokens.sql
-- Password reset token table — replaces Supabase Auth's built-in recovery flow.

CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
    user_id     UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    token       TEXT        NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id)
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token
    ON public.password_reset_tokens(token);

-- No RLS: this table is only accessed by service role (API routes with admin client)
ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON public.password_reset_tokens USING (FALSE);
