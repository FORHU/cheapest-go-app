-- migrate:up
-- Presence, recorded per session: evidence that a person is actually at the screen (a
-- click, keypress, scroll or touch, or a request one of those caused). It is what the
-- Idle Limit (CONTEXT.md, ADR-0027) measures the absence of — ten minutes for staff,
-- thirty for travellers, enforced server-side because a limit the browser keeps is one
-- the browser can decline to keep.
--
-- Defaults to now() so a freshly created session starts inside its own limit rather than
-- expired on arrival, and so every row that predates this column (there is no backfill)
-- reads as "active as of the migration" instead of NULL and instantly idle.
ALTER TABLE public.sessions
    ADD COLUMN IF NOT EXISTS last_active_at timestamp with time zone NOT NULL DEFAULT now();

-- migrate:down
ALTER TABLE public.sessions
    DROP COLUMN IF EXISTS last_active_at;
