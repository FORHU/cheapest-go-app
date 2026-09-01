-- migrate:up
-- hotel_content: convert jsonb columns that hold a JSON *string* into real jsonb.
--
-- postgres.js infers a parameter interpolated against a `::jsonb` cast as jsonb and
-- JSON-encodes it, so `${JSON.stringify(arr)}::jsonb` double-encodes: the cast lands on
-- an already-encoded string and the column stores `"[\"Air Conditioning\"]"` rather than
-- `["Air Conditioning"]`. Verified against this database:
--
--     ${JSON.stringify(arr)}::jsonb  ->  string
--     ${sql.json(arr)}               ->  array
--
-- Every row with real amenities was affected, which is why `Array.isArray(r.amenities)`
-- was false for exactly the rows that had data — the property page then fell back to
-- un-normalised supplier text, and untranslated German and Italian reached customers.
-- The writers now use sql.json(); this repairs what they already wrote.
--
-- Idempotent: only rows whose current jsonb_typeof is 'string' are touched, and the
-- guard means re-running is a no-op. `#>> '{}'` extracts the string body, which is then
-- re-parsed as jsonb. Rows whose body is not valid JSON are left alone rather than
-- failing the migration.

UPDATE public.hotel_content
SET amenities = (amenities #>> '{}')::jsonb
WHERE jsonb_typeof(amenities) = 'string'
  AND (amenities #>> '{}') IS NOT NULL
  AND left(ltrim(amenities #>> '{}'), 1) IN ('[', '{');

UPDATE public.hotel_content
SET amenity_groups = (amenity_groups #>> '{}')::jsonb
WHERE jsonb_typeof(amenity_groups) = 'string'
  AND (amenity_groups #>> '{}') IS NOT NULL
  AND left(ltrim(amenity_groups #>> '{}'), 1) IN ('[', '{');

UPDATE public.hotel_content
SET contact_info = (contact_info #>> '{}')::jsonb
WHERE jsonb_typeof(contact_info) = 'string'
  AND (contact_info #>> '{}') IS NOT NULL
  AND left(ltrim(contact_info #>> '{}'), 1) IN ('[', '{');

UPDATE public.hotel_content
SET room_groups = (room_groups #>> '{}')::jsonb
WHERE jsonb_typeof(room_groups) = 'string'
  AND (room_groups #>> '{}') IS NOT NULL
  AND left(ltrim(room_groups #>> '{}'), 1) IN ('[', '{');

-- migrate:down
-- Not reversed. Re-encoding correct jsonb back into a string would restore a bug, and
-- the readers accept both shapes, so there is nothing to roll back to.
SELECT 1;
