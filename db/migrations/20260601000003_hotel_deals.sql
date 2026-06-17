-- migrate:up
-- hotel_deals predates the dbmate migration history (it existed in the
-- original database but was never created by a migration file — later
-- migration 20260605000002_hotel_deals.sql ALTERs it assuming it already
-- exists). This creates the base table so a fresh database can bootstrap
-- from scratch; IF NOT EXISTS makes it a no-op against the existing dev DB.

CREATE TABLE IF NOT EXISTS public.hotel_deals (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name            text NOT NULL,
    location        text NOT NULL,
    destination     text NOT NULL,
    country_code    text DEFAULT '',
    rating          numeric(3,1) DEFAULT 0,
    stars           integer DEFAULT 0,
    image_url       text DEFAULT '',
    price           numeric(10,2) NOT NULL DEFAULT 0,
    original_price  numeric(10,2) DEFAULT 0,
    currency        text DEFAULT 'PHP',
    discount_tag    text DEFAULT '',
    discount_pct    integer DEFAULT 0,
    check_in        date,
    check_out       date,
    badge           text,
    hotel_code      text DEFAULT '',
    updated_at      timestamp with time zone DEFAULT now()
);

-- migrate:down
DROP TABLE IF EXISTS public.hotel_deals;
