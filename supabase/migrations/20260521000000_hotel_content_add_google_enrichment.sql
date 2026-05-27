-- Track Google Places enrichment so we avoid re-fetching and know which
-- hotels have been enriched vs genuinely have no Google listing.
alter table hotel_content
  add column if not exists google_place_id    text,
  add column if not exists google_enriched_at timestamptz;

-- Index for the enrichment job query (hotels needing enrichment)
create index if not exists hotel_content_google_enriched_idx
  on hotel_content (google_enriched_at)
  where lat != 0 and lng != 0;
