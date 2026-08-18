-- Clear hotel images that were seeded from ETG geocoding (city search fallback).
-- ETG geocoding images are often wrong (e.g. nearby restaurant photos instead of the hotel).
-- TGX is the authoritative image source for our supplier hotels — the TGX content upsert
-- now always overwrites images (fixed 2026-08-18), so clearing here lets the next property
-- page visit pull correct TGX images.
UPDATE hotel_content
SET images = '{}'
WHERE content_source = 'etg'
  AND array_length(images, 1) > 0;
