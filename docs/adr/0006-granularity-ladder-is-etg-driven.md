# The destination granularity ladder is ETG-driven

**Status:** Accepted — implemented on branch `additional-map` (typechecks; existing search tests pass). **Not yet verified against the live ETG API** — the `search/serp/geo/` request contract (`latitude`/`longitude`/`radius` in metres) needs a real end-to-end check before merge.

Hotel search resolves a place at one of five granularities — **Country, Province/State, City, District, Specific** (landmark/address) — and four of them are served by **ETG** alone. Area rungs (Country, Province, City) resolve to an ETG region identifier and hit `search/serp/region/`; point rungs (District, Specific) have no area code, so they resolve to a **coordinate + radius** and hit ETG's `search/serp/geo/` endpoint. OTV/TravelGateX has no coordinate or sub-city search and contributes only at the City rung — so ETG is effectively the geographic search engine and OTV a city-level price-competition layer on top.

## Context

Searching a district ("Gangnam") or a landmark returned zero hotels because every resolution path is keyed to a city-or-coarser identifier: `hotel_content.city` is city-level, OTV destination codes don't expose sub-city inventory, and the ETG region allow-list (`getEtgRegionId`) excluded District-type regions. Mapbox already returns each place's `center` coordinate and `bbox`, but the autocomplete discarded them ([search.ts](../../src/lib/server/search.ts)). Capturing those coordinates lets any point be searched via ETG `serp/geo`, which needs only lat/lng + radius.

## Decision

- **Autocomplete** surfaces and tags all five rungs (Mapbox `country`/`region`/`place`/`district`/`locality`/`poi`/`address`) and carries each result's `center` + `bbox` through `AutocompleteResult` → `Destination` → the search body.
- **Area rungs** → ETG `region_id` → `serp/region` (City additionally via OTV). A whole-**Country** search becomes a real country-region search instead of silently collapsing to one default city (`COUNTRY_DEFAULT_CITY`).
- **Point rungs** → ETG `serp/geo`. Districts size the radius from their Mapbox `bbox` (covers exactly the district); landmarks/addresses start at 2 km and **auto-widen** (5 → 10 km cap) so a pick never dead-ends, yet "near X" stays near X.
- **No OTV+ETG union at any rung.** Accept ETG single-supplier dependency for geographic search. This *extends* [ADR-0004](0004-province-search-is-etg-only.md) (province ETG-only) to the whole sub-city/area ladder rather than superseding it — the cross-supplier dedup that ADR-0004 rejected stays rejected.

## Considered Options

- **OTV bbox safety net for districts** — search the parent city on OTV and filter to the district bbox, merged with ETG geo. Rejected: it revives the OTV-code-vs-ETG-slug dedup ADR-0004 turned down, for a rung OTV can't natively serve anyway.
- **Keep the country facade, relabelled** — rejected; the CEO asked for real country coverage, and the same ETG region path already powers provinces.

## Consequences

- An ETG outage takes **Country, Province, District, and Specific** searches dark simultaneously; only **City** survives (via OTV). This is the accepted cost of no union.
- Sub-city and landmark searches get **no Phase-1 instant catalog** — `hotel_content` is city-keyed, so their first paint waits on the live ETG call.
- The picker can now legitimately offer places with no nearby hotels; **auto-widen** absorbs this instead of showing an empty list.
- ETG-seeded results must record each hotel's **real city** (from ETG hotel info), not the searched District/landmark label, or `hotel_content.city` gets polluted and future city searches mis-key.
- The hotel-search **cache key** must key point searches by rounded coordinate + radius (not `city:<name>`), or distinct districts collide.
