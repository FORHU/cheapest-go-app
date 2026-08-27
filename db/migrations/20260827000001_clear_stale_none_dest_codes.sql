-- migrate:up
-- tgx_destination_cache: clear the NONE Sentinels left by the TGX 5xx burst of
-- 2026-08-21.
--
-- A NONE row means "TGX's destinationSearcher has no code for this city", and it is
-- written on ANY TGX 5xx — including a transient one. Nothing expired it and the
-- success path refused to overwrite it, so a single outage pinned 3,828 cities
-- permanently onto Hotel-Code Fallback, which CONTEXT.md describes as a bounded
-- subset. Measured cost on Seoul: 89 hotels via the fallback against 185 via its
-- real destination code 3124 — roughly half the inventory, on every search since.
--
-- Every one of the twelve most-searched cities was affected: seoul, daejeon, jeju,
-- manila, baguio, cebu, bangkok, paris, yeoju, seongnam, singapore, busan.
--
-- Deleting is safe and self-correcting: a missing row simply means "not resolved
-- yet", so the next search for that city re-asks TGX and writes back whatever it
-- gets — a real code, or a fresh NONE if the city genuinely has none. Real codes
-- are left untouched; only NONE rows are removed.
--
-- The readers now apply a 7-day window to NONE (matching tgx_failed_dest_codes,
-- which always did), so a future outage degrades a city for at most a week rather
-- than forever. This migration only clears the damage already done.
DELETE FROM public.tgx_destination_cache
WHERE destination_code = 'NONE';

-- migrate:down
-- Irreversible by design: the deleted rows carried no information worth restoring —
-- each was a failed lookup, not a fact about supplier coverage. Cities re-resolve
-- on their next search.
SELECT 1;
