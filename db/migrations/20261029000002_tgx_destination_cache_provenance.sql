-- migrate:up
-- Who last wrote a destination code, and when.
--
-- `created_at` could answer neither. The nightly sync's upsert set the code, type and parent
-- and nothing else, so a row kept the timestamp of its first insert however many times its
-- value was rewritten afterwards. `jeju:kr` read 2026-09-09 while holding a code written long
-- after that — a destination that had silently changed meaning, looking untouched.
--
-- `source` exists so a repair made by hand survives the next sync. The sync writes 'sync', the
-- live resolver writes 'resolver', and a row marked 'manual' is left alone by both: the Paris
-- code was corrected to 2734 by a person, and a sync that overwrites that undoes the fix and
-- leaves no trace it ever happened.
ALTER TABLE public.tgx_destination_cache
    ADD COLUMN IF NOT EXISTS source     text,
    ADD COLUMN IF NOT EXISTS updated_at timestamptz;

-- Existing rows are left NULL rather than guessed at. The sync reads NULL as its own
-- (`coalesce(source, 'sync')`), so the first run after this corrects them exactly as it would
-- have before, and no row claims a provenance nobody recorded.

-- migrate:down
ALTER TABLE public.tgx_destination_cache
    DROP COLUMN IF EXISTS updated_at,
    DROP COLUMN IF EXISTS source;
