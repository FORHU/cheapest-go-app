create table if not exists hotel_content (
  hotel_id   text primary key,
  name       text,
  images     text[] not null default '{}',
  star_rating smallint not null default 0,
  lat        double precision not null default 0,
  lng        double precision not null default 0,
  fetched_at timestamptz not null default now()
);

-- Edge functions use the service role key and bypass RLS,
-- but we still define policies for completeness.
alter table hotel_content enable row level security;

-- Public read (search results shown to all users)
create policy "hotel_content_public_read"
  on hotel_content for select
  using (true);

-- Only service role can write (edge function upserts)
create policy "hotel_content_service_write"
  on hotel_content for all
  using (auth.role() = 'service_role');

-- Index for bulk lookups by hotel_id array
create index if not exists hotel_content_fetched_at_idx on hotel_content (fetched_at);
