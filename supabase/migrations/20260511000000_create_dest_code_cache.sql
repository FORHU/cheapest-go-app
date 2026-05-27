create table if not exists dest_code_cache (
  city_key    text primary key,   -- lowercase trimmed city name used as lookup key
  dest_codes  text[] not null default '{}',
  hotel_codes text[] not null default '{}',
  fetched_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);

alter table dest_code_cache enable row level security;

create policy "dest_code_cache_public_read"
  on dest_code_cache for select
  using (true);

create policy "dest_code_cache_service_write"
  on dest_code_cache for all
  using (auth.role() = 'service_role');

create index if not exists dest_code_cache_expires_at_idx on dest_code_cache (expires_at);
