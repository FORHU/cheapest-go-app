-- When OTV stops carrying a hotel, the row stays and stops being offered.
--
-- `hotel_content` holds every hotel we have ever heard of, and the portfolio holds the ones
-- OTV will actually sell today. The two drifted apart without anyone noticing: on 2026-09-21
-- roughly 30,300 rows were hotels the supplier no longer lists. They still cost us twice.
-- They are drawn on the map during the catalog phase, so the pin count promises more than any
-- search can deliver and the extra pins are then withdrawn mid-search — the "it said 300 and
-- showed me two" report. And they are sent to OTV inside the hotel-code batches, which asks
-- the supplier about inventory it has told us it does not have.
--
-- Marked, not deleted. A hotel leaves the portfolio for a season and comes back, and what
-- deletion would throw away is exactly the part that is expensive to rebuild: the images,
-- descriptions, amenities and review scores collected from other sources over time. Nothing
-- references `hotel_content` by foreign key, so a delete would succeed and quietly strip the
-- name and photo from every past booking of that hotel.
--
-- Two rules govern who may set this, and both live in the sync rather than here, because a
-- column cannot enforce them:
--
--   * only a portfolio pull that ran to completion may mark anything absent. A pull that
--     died at page 1,200 of 2,477 has not seen the rest of the portfolio, and letting it
--     speak would delist half the catalogue on one network blip.
--   * only rows whose content_source is 'tgx'. An OTV pull is evidence about OTV's hotels
--     and about nothing else; ETG supplies hotels OTV never carried.
--
-- Cleared automatically when a hotel reappears, so a seasonal absence needs no intervention.
--
-- No index: the column is NULL for almost every row, and every reader asks for exactly that,
-- so an index on it would be read past rather than used.
--
-- Applied by hand (see the migrations note in the project memory). Pipe in only the upward
-- section — the reverse section below drops the column, so running the whole file undoes
-- itself.

-- migrate:up
ALTER TABLE public.hotel_content
    ADD COLUMN IF NOT EXISTS delisted_at TIMESTAMPTZ;

COMMENT ON COLUMN public.hotel_content.delisted_at IS
    'First completed OTV portfolio sync that did not list this hotel. NULL means currently offered. Cleared when the hotel reappears.';

-- migrate:down
ALTER TABLE public.hotel_content
    DROP COLUMN IF EXISTS delisted_at;
