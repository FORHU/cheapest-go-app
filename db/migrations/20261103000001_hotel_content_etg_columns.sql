-- migrate:up
-- The three ETG content columns the property page reads.
--
-- These existed only as a Prisma migration in cheapestgo-api-v2
-- (20260901025827_hotel_content_etg_columns), a directory this runner never scans — so no
-- database driven by db/migrations/ could ever receive them, and Prisma could not apply them
-- either: `migrate deploy` refuses with P3005 against a schema it did not create. The columns
-- were therefore unreachable from both directions.
--
-- The cost was a hard outage. getProperty selects etg_content_seeded_at through Prisma, which
-- raised P2022 on a column Postgres did not have, and every hotel property page on
-- v2.cheapestgo.com returned 500 until the ALTER was run by hand on 2026-11-03. Repeating that
-- SQL here is what makes it survive a restore, reach every environment, and stop being a thing
-- someone has to remember.
--
-- Nullable with no backfill on purpose: ensureEtgContent treats a null etg_content_seeded_at as
-- "never seeded" and fetches from the supplier on the next read, which is the correct state for
-- every existing row. A guessed timestamp would instead mark stale rows fresh and suppress the
-- fetch for the whole FRESH_MS window.
ALTER TABLE public.hotel_content
    ADD COLUMN IF NOT EXISTS etg_content_seeded_at timestamptz(6),
    ADD COLUMN IF NOT EXISTS metapolicy_extra_info text,
    ADD COLUMN IF NOT EXISTS metapolicy_struct     jsonb;

-- migrate:down
ALTER TABLE public.hotel_content
    DROP COLUMN IF EXISTS metapolicy_struct,
    DROP COLUMN IF EXISTS metapolicy_extra_info,
    DROP COLUMN IF EXISTS etg_content_seeded_at;
