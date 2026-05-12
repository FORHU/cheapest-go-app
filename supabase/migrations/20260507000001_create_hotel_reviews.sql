create table if not exists hotel_reviews (
  hotel_id      text primary key,   -- numeric HID string, matches hotel_content.hotel_id
  rating        numeric(4,2),        -- 0–10 scale (ETG aggregate score)
  reviews_count int not null default 0,
  synced_at     timestamptz not null default now()
);

alter table hotel_reviews enable row level security;

create policy "hotel_reviews_public_read"
  on hotel_reviews for select
  using (true);

create policy "hotel_reviews_service_write"
  on hotel_reviews for all
  using (auth.role() = 'service_role');

create index if not exists hotel_reviews_synced_at_idx on hotel_reviews (synced_at);
