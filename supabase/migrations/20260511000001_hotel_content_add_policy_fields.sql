alter table hotel_content
  add column if not exists check_in_time        text,
  add column if not exists check_out_time       text,
  add column if not exists review_rating        numeric(4,2),
  add column if not exists review_count         integer,
  add column if not exists amenity_groups       jsonb  not null default '[]',
  add column if not exists important_information text;
