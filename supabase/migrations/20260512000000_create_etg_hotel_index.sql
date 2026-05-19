-- ETG hotel name → HID index for worldwide image resolution.
-- Populated by the seed-etg-index edge function, one country at a time.
-- Used by fetchHotelContent to find ETG HIDs for TGX hotels that don't embed one.

create extension if not exists pg_trgm;

create table if not exists etg_hotel_index (
  hid            bigint      primary key,
  name           text        not null,
  name_normalized text       not null,
  lat            double precision default 0,
  lng            double precision default 0,
  country_code   char(2)     not null,
  region_id      bigint,
  star_rating    smallint    default 0,
  indexed_at     timestamptz default now()
);

-- Fast exact + trigram fuzzy lookup by country + name
create index if not exists etg_hotel_index_country_name
  on etg_hotel_index (country_code, name_normalized);

create index if not exists etg_hotel_index_name_trgm
  on etg_hotel_index using gin (name_normalized gin_trgm_ops);

-- Tracks seeding progress per country so the seeder can resume
create table if not exists etg_index_status (
  country_code   char(2)     primary key,
  status         text        not null default 'pending', -- pending | seeding | done
  hotel_count    integer     default 0,
  last_seeded_at timestamptz,
  last_error     text
);

alter table etg_hotel_index enable row level security;
alter table etg_index_status enable row level security;
