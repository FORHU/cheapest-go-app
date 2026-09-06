-- migrate:up

-- Unwraps jsonb columns that were written as JSON *strings* instead of objects.
--
-- Cause: `${JSON.stringify(obj)}::jsonb` in tagged-template queries. postgres.js
-- already serializes an object for a jsonb parameter, so the manual stringify wrapped
-- it a second time and the column ended up holding a quoted string. The effect is
-- silent and total: `provider_metadata ->> 'supplierRef'` returns NULL, and in JS the
-- driver hands back a string, so `meta?.supplierRef` is undefined. Every TravelgateX
-- cancellation went out with no supplier reference and no hotel code because of this.
--
-- The write sites now use `sql.json(obj)`. This backfills what they already wrote.
--
-- Idempotent: the guard only matches columns still holding a string, so re-running
-- changes nothing. `#>> '{}'` extracts the string's text, which is then re-parsed.

UPDATE bookings
   SET provider_metadata = (provider_metadata #>> '{}')::jsonb
 WHERE jsonb_typeof(provider_metadata) = 'string';

UPDATE bookings
   SET cancellation_policy = (cancellation_policy #>> '{}')::jsonb
 WHERE jsonb_typeof(cancellation_policy) = 'string';

UPDATE booking_policy_snapshots
   SET raw_liteapi_response = (raw_liteapi_response #>> '{}')::jsonb
 WHERE jsonb_typeof(raw_liteapi_response) = 'string';

-- hotel_content.room_groups shared the same buggy write pattern but has no affected
-- rows — every one is a proper array, written by the seed path that already used
-- sql.json. Left out deliberately rather than overlooked: an UPDATE guarded on
-- jsonb_typeof would still scan ~1.1M rows to change none.

-- migrate:down

-- No down migration. Reversing this would mean re-encoding correct jsonb objects back
-- into quoted strings, which restores a bug and loses nothing worth restoring.
SELECT 1;
