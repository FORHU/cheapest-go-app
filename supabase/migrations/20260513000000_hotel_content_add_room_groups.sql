-- Add room_groups column to persist ETG per-room image data
alter table hotel_content
  add column if not exists room_groups jsonb default '[]'::jsonb;
