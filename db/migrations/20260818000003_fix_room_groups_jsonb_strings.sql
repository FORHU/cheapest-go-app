-- migrate:up
-- Fix room_groups rows that were stored as a JSONB string scalar instead of a JSONB array.
-- Root cause: backgroundSeedEtgContent used JSON.stringify()::jsonb which double-encoded
-- the value, producing a JSONB string like "[{\"name\":\"...\"}]" rather than an array.
-- Fix: extract the text value and re-cast as JSONB.

UPDATE hotel_content
SET room_groups = (room_groups #>> '{}')::jsonb
WHERE room_groups IS NOT NULL
  AND jsonb_typeof(room_groups) = 'string';

-- migrate:down
-- Irreversible, and deliberately so: the up block repairs double-encoded values.
-- Re-encoding them would restore a bug, not a prior state.
