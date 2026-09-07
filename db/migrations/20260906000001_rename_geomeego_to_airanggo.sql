-- migrate:up
-- GeomeeGo became AirangGo in the 2026-09 rebrand, decided by the Korean partner.
--
-- source_brand is the authority on which storefront took a sale — the admin brand filter
-- reads it, revenue reporting groups by it, and the CG-/GG- reference prefix is derived
-- from the same brand name at mint time. Leaving the old string in place would split one
-- brand's history across two values, so every row moves.
--
-- The application still tolerates both names, deliberately and for a while yet:
--
--   * brand-filter.ts matches AirangGo OR GeomeeGo, so a row written between this
--     migration and the Korean instance being redeployed is still visible in admin.
--   * bookingReference.ts maps both names to the GG prefix, so references stay
--     attributable whichever name the process was started with.
--   * csrf.ts allows both geomeego.com and airanggo.com while DNS moves.
--
-- That tolerance is what makes this migration safe to run before the redeploy rather than
-- during it. Remove it only once no deployment can still be serving the old name.
--
-- Idempotent: re-running matches nothing.

UPDATE bookings         SET source_brand = 'AirangGo' WHERE source_brand = 'GeomeeGo';
UPDATE flight_bookings  SET source_brand = 'AirangGo' WHERE source_brand = 'GeomeeGo';
UPDATE unified_bookings SET source_brand = 'AirangGo' WHERE source_brand = 'GeomeeGo';

-- migrate:down
UPDATE bookings         SET source_brand = 'GeomeeGo' WHERE source_brand = 'AirangGo';
UPDATE flight_bookings  SET source_brand = 'GeomeeGo' WHERE source_brand = 'AirangGo';
UPDATE unified_bookings SET source_brand = 'GeomeeGo' WHERE source_brand = 'AirangGo';
