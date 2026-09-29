-- The map's first paint was a sequential scan of every hotel we have ever heard of.
--
-- Phase 1 of a search draws pins from `hotel_content` within the map's bounding box, and that
-- is the whole of what a traveller sees for the first few seconds. It had no index to use:
-- `hotel_content_google_enriched_idx` mentions lat and lng, but only in its WHERE clause, so
-- it answers "which hotels still need enriching" and nothing about where a hotel is.
--
-- Measured 2026-09-21 on 1,142,055 rows, a Fukuoka-sized box:
--
--   before   Parallel Seq Scan, 380,426 rows discarded per worker, 42,123 buffers read   263 ms
--   after    Index Scan, 777 rows                                                        4.5 ms
--
-- The observed cost was larger than 263 ms, because that figure is from a warm cache and the
-- scan reads 330 MB of table to return a few hundred rows. In a cold search the pins appeared
-- at 1.96 s; the supplier had not been waited on yet.
--
-- A plain btree on (lat, lng) rather than anything spatial. Postgres uses the leading column
-- for the latitude range and filters longitude from the same index entries, which on a city
-- box is already the whole win. GiST over a point would be the textbook answer and would need
-- the query rewritten to use a geometric operator; this one needs nothing changed and was
-- measured at 4.5 ms, so the textbook answer has nothing left to buy.
--
-- CONCURRENTLY because the table is 1.1M rows on live and a plain CREATE INDEX holds a write
-- lock for the duration. It cannot run inside a transaction block: pipe this file into psql as
-- is, and do not wrap it with -1 or BEGIN.
--
-- Applied by hand (see the migrations note in the project memory). Pipe in only the upward
-- section — the reverse section below drops the index, so running the whole file undoes itself.

-- migrate:up
CREATE INDEX CONCURRENTLY IF NOT EXISTS hotel_content_latlng_idx
    ON public.hotel_content (lat, lng);

-- migrate:down
DROP INDEX CONCURRENTLY IF EXISTS public.hotel_content_latlng_idx;
