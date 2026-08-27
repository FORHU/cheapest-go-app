# Supplier coordinates are authoritative; geocoding makes them worse

`hotel_content.lat`/`lng` come from OTV and ETG and are kept as the suppliers give them. `/api/cron/geocode-hotels` exists to re-derive them from postal addresses via Nominatim, and is deliberately not scheduled — not by the cron sidecar, not by a GitHub Actions workflow. Nothing calls it.

We measured it before deciding. Sharing an exact coordinate with another hotel is the signature of a geocoder that could not resolve an address and fell back to a street or town centroid, so it is a usable proxy for precision. Across the eligible population on 2026-08-27 — every row with real coordinates, which is also every row with an address, so the two groups are the same population and not a selection artefact:

| Rows | Sharing an exact coordinate |
| --- | --- |
| Not yet geocoded (898,630) | 4.0% |
| Geocoded by Nominatim (239,764) | 9.3% |

Geocoding more than doubles the pile-up rate. It is not filling a gap either: of 1,138,396 hotels, exactly **2** have no usable coordinates at all. The job was solving a problem we do not have, using a source worse than the one we already trust.

## Consequences

- **239,764 hotels already carry Nominatim coordinates**, overwritten in place with no original retained. `osm_geocoded_at` identifies them. Repairing them means re-pulling `lat`/`lng` from the ETG dump; that has not been done and is a separate decision.
- **The route stays in the tree, unscheduled.** It remains usable by hand for the 2 hotels with genuinely missing coordinates. This ADR exists mainly so the missing schedule reads as a decision rather than an oversight — the obvious "fix" is to wire it up, which would degrade the remaining 898,630.
- **The proxy is not proof of mispinning.** A shared coordinate is strong evidence of a centroid fallback, but some US resort clusters legitimately share one address — 111 hotels sit on a single point in Gulf Shores. The 2.3× gap between the two groups is not explained by that, but no one has checked individual hotels against their real position on a map.
- **Revisit if a paid geocoder is ever adopted.** The finding is about Nominatim's free tier resolving worse than OTV and ETG do, not about geocoding as an idea.
