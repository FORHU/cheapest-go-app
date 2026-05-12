-- Add rich content columns to hotel_content that were missing in the original migration.
-- These are used by the improved TGX content fetcher to store address, description, etc.

alter table hotel_content
  add column if not exists address     text,
  add column if not exists city        text,
  add column if not exists country     text,
  add column if not exists description text,
  add column if not exists amenities   jsonb not null default '[]',
  -- ratehawk_hid is the ETG/RateHawk numeric hotel ID (as text).
  -- Used to cross-reference TGX hotel_content with ETG hotel info/reviews APIs.
  add column if not exists ratehawk_hid text,
  -- Track which access code successfully returned content so we avoid re-fetching
  -- from a known-empty source.
  add column if not exists content_source text,
  -- Track when we last *attempted* a content fetch (even if it returned nothing).
  -- Prevents infinite re-fetch loops for hotels with genuinely no images.
  add column if not exists last_attempt_at timestamptz;

-- Index to quickly look up by RateHawk HID (for ETG reviews join)
create index if not exists hotel_content_ratehawk_hid_idx on hotel_content (ratehawk_hid)
  where ratehawk_hid is not null;
