# Province/Region search is ETG-only

Searches for a **Province/Region** place (e.g. "Palawan") are served exclusively by **ETG** (RateHawk), via its region SERP endpoint, while **OTV/TravelGateX** stays City/Zone-only. We chose this because OTV's destination model doesn't cleanly expose province-level inventory (and returns "Empty hotels" for many *city* codes already — see `tgx_failed_dest_codes`), whereas ETG treats a province as just another `region_id`, so widening ETG's destination-type filter reproduces exactly what Ratehawk's own site shows for a province. The autocomplete offers provinces (Mapbox `region` results), so without this the picker invited a search the backend silently returned zero hotels for.

## Considered Options

- **ETG-only for provinces (chosen)** — one filter change in `getEtgRegionId`; no dedup, no added latency.
- **Union OTV + ETG at both granularities** — rejected. It would require flipping the OTV→ETG fallback *chain* into a parallel merge, forcing a cross-supplier dedup strategy (OTV hotel codes and ETG slugs share no key) and doubling supplier load on every search. A one-off probe settled whether it was even worth it: for "Palawan", TGX exposes **no** province-level destination code (only `CITY`/`ZONE` codes), and the relevant OTV city code (`966243262`) returns `Empty hotels`. So OTV contributes nothing at province level and the union buys zero province inventory. (Probe route since removed — recoverable from git history if the union is ever revisited for another region.)

## Consequences

- A future reader will see province searches bypass the primary supplier (OTV) entirely — that is deliberate, not a bug.
- First search of a large province shows some hotels with slug-like names until `hotel_content` is background-seeded by `seedEtgHotelContent`.
- If the union is ever adopted, this ADR should be superseded rather than edited.
