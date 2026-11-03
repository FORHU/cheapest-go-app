-- migrate:up
-- Repair for hotel_deals on databases where the table predates its own definition.
--
-- 20260601000003_hotel_deals.sql creates the table with every column below, but under
-- CREATE TABLE IF NOT EXISTS. Where a hotel_deals already existed the whole statement was
-- skipped, columns and all, and no later migration added them — so the table sat there
-- looking migrated while missing most of itself. Production was in exactly that state:
-- check_in, then badge, then whatever came next raised P2022 one column at a time, and
-- /api/v2/hotels/deals returned 500 continuously.
--
-- A clean database gets these from the CREATE and skips every clause here, so this is a no-op
-- where nothing is wrong. It exists for the drifted ones, which no amount of re-running the
-- original migration would have fixed.
--
-- Defaults match the CREATE so a repaired table and a freshly created one are identical.
ALTER TABLE public.hotel_deals
    ADD COLUMN IF NOT EXISTS country_code      text              DEFAULT '',
    ADD COLUMN IF NOT EXISTS rating            numeric(3,1)      DEFAULT 0,
    ADD COLUMN IF NOT EXISTS stars             integer           DEFAULT 0,
    ADD COLUMN IF NOT EXISTS image_url         text              DEFAULT '',
    ADD COLUMN IF NOT EXISTS price             numeric(10,2)     NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS original_price    numeric(10,2)     DEFAULT 0,
    ADD COLUMN IF NOT EXISTS currency          text              DEFAULT 'PHP',
    ADD COLUMN IF NOT EXISTS discount_tag      text              DEFAULT '',
    ADD COLUMN IF NOT EXISTS discount_pct      integer           DEFAULT 0,
    ADD COLUMN IF NOT EXISTS check_in          date,
    ADD COLUMN IF NOT EXISTS check_out         date,
    ADD COLUMN IF NOT EXISTS badge             text,
    ADD COLUMN IF NOT EXISTS hotel_code        text              DEFAULT '',
    ADD COLUMN IF NOT EXISTS updated_at        timestamptz(6)    DEFAULT now(),
    ADD COLUMN IF NOT EXISTS city_key          text,
    ADD COLUMN IF NOT EXISTS lat               numeric(9,6),
    ADD COLUMN IF NOT EXISTS lng               numeric(9,6),
    ADD COLUMN IF NOT EXISTS board_code        text,
    ADD COLUMN IF NOT EXISTS refundable        boolean,
    ADD COLUMN IF NOT EXISTS baseline_price    numeric(10,2),
    ADD COLUMN IF NOT EXISTS last_refreshed_at timestamptz(6);

-- hotel_code is @unique in the api-v2 Prisma model, and the index is deliberately not created
-- here. Where the column was just added every row holds the '' default, so a unique index would
-- fail outright; and on a drifted table the duplicates have to be resolved by a person who knows
-- which row is real. Worth doing, separately, once someone has looked.

-- migrate:down
-- Deliberately empty. Every column above belongs to hotel_deals' own CREATE TABLE in
-- 20260601000003_hotel_deals.sql, so on a database built from scratch they are part of the
-- table rather than something this migration added. Dropping them on rollback would delete
-- columns it never created.
SELECT 1;
