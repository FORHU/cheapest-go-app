create table if not exists search_results_cache (
  cache_key   text        primary key,
  city_name   text        not null,
  region_id   int         not null default 0,
  checkin     date        not null,
  checkout    date        not null,
  adults      int         not null default 2,
  children    int         not null default 0,
  rooms       int         not null default 1,
  currency    text        not null default 'USD',
  nationality text        not null default 'KR',
  hotels      jsonb       not null default '[]'::jsonb,
  total_count int         not null default 0,
  cached_at   timestamptz not null default now(),
  expires_at  timestamptz not null
);

create index if not exists idx_src_city_checkin  on search_results_cache (city_name, checkin);
create index if not exists idx_src_expires_at    on search_results_cache (expires_at);
