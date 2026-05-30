-- Individual review rows extracted from the nightly ETG reviews dump.
-- hotel_id matches hotel_content.hotel_id (numeric ETG/TGX HID string).
-- source_id is the ETG review's own id field (or a positional fallback).

create table if not exists hotel_review_items (
  id            bigint generated always as identity primary key,
  hotel_id      text not null,
  source_id     text not null,
  reviewer_name text,
  review_date   text,
  score         numeric(4,2),
  pros          text,
  cons          text,
  traveler_type text,
  language      text,
  headline      text,
  country       text,
  synced_at     timestamptz not null default now(),
  unique (hotel_id, source_id)
);

create index if not exists hotel_review_items_hotel_id_idx on hotel_review_items (hotel_id);
create index if not exists hotel_review_items_score_idx on hotel_review_items (hotel_id, score desc);

alter table hotel_review_items enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'hotel_review_items'
    and policyname = 'hotel_review_items_public_read'
  ) then
    create policy "hotel_review_items_public_read"
      on hotel_review_items for select
      using (true);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'hotel_review_items'
    and policyname = 'hotel_review_items_service_write'
  ) then
    create policy "hotel_review_items_service_write"
      on hotel_review_items for all
      using (auth.role() = 'service_role');
  end if;
end $$;
