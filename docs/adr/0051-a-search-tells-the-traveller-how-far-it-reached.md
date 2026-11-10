# ADR-0051: A search tells the traveller how far it reached, rather than pretending it did not

## Status

Accepted — 2026-11-06

## Context

A Tokyo search was reported as showing hotels in Kawasaki, which is Kanagawa and not Tokyo. The
reading was that the search was inaccurate and should be tightened to the city. Measuring it said
otherwise.

A live Tokyo search returns **297 hotels, and all 297 are in Tokyo Metropolis**. The furthest, at
39 km, is in Takao; the rest of the far tail is Hachioji, Fussa, Hamura, Akikawa and Machida —
every one of them Tokyo. All 297 carry `city: "Tokyo"`, and spot-checking the extremes against
their addresses shows the label is right rather than the stamped-from-the-search-term pollution
[ADR-0006](0006-granularity-ladder-is-etg-driven.md) warns about. The nearest thing to a genuine
outlier is an Ota City hotel on the Tama River, 18 km out and unambiguously Tokyo.

The Kawasaki pin was not a hotel. The map clusters with Supercluster, which places a cluster at the
mean centre of its points, so two Ota hotels either side of the river put a bubble over Kawasaki,
marking nothing.

So the data was right and the complaint was still real. What the storefront never said was
**how far away anything was**. A ₱4,757 hotel in Hachioji is a bargain if you want Mount Takao and
useless if you want Shibuya, and the card showed only `Hachioji, Tokyo` and a price.

## Decision

**A hotel's distance from the point the traveller searched is part of the result, and it is shown
when that distance is large for the scale of the search.**

1. **Computed server-side, in the pass that already computes it.** `haversineKm` runs per row in
   `search.ts` to cull the bounding box to a true circle and the value is then discarded. It is
   carried on the result instead. This follows `Nightly Rate` in CONTEXT.md — divided server-side
   "so no screen can forget and none can do it twice."

2. **Shown only past a threshold, and the threshold is per rung** — the ladder in
   [ADR-0006](0006-granularity-ladder-is-etg-driven.md):

   | Rung | Shown above | Why |
   |---|---|---|
   | Specific (landmark, address) | 1 km | the search *is* "near here"; those searches cap at a 10 km radius, so any flat kilometre rule would silence them entirely |
   | District | 5 km | a district is a few km across |
   | City | 15 km | tags 26% of Tokyo, 17% of Jeju, 1% of Seoul |
   | Province, Country | never | distance from the middle of Hokkaido tells nobody anything |

3. **The label names the anchor.** "33 km from Tokyo", never "33 km from centre" — the second one
   never says the centre of what.

## Alternatives considered

**Tighten the 50 km radius.** The obvious reading of the complaint, and it fixes nothing. The limit
is never reached: the furthest hotel in Tokyo is 39 km and in Jeju 34 km. Cutting to 25 km drops 11
of Jeju's 133, and they sit in the 25–30 km band — which is Seogwipo, the case
[search.ts](../../../cheapestgo-api-v2/src/lib/hotels/search.ts) names in its own comment as the
reason the radius exists. Cutting deep enough to exclude Kawasaki at 18 km would take Tokyo down to
83% and delete large parts of Setagaya and Nerima.

**Bound a city search by the destination's Mapbox bbox.** Tempting, since the picker already
returns one. Measured, it is wrong in both directions at once: Tokyo's bbox is the 23-ward core as
a rectangle, so it **excludes** Fuchu, which is Tokyo, and **includes** Kawasaki, which is not.

**Filter results to the administrative city.** Rejected on precedent.
[ADR-0042](0042-a-hotels-country-is-corrected-where-it-is-read.md) is titled for this and records
what happened last time geometry decided alone: hand-drawn country boxes silently dropped 3,950
real hotels across 73 countries from searches of their own country — 170 of Uruguay's 313, all of
Galápagos, Montego Bay, Dakar. Its rule is that a hotel is out of area only when two kinds of
evidence agree, and point 3 of it already settled this specific question for the circle: other
countries keep the cross-border circle, because that is its purpose.

**Show the distance on every result.** Simpler, no rung logic, and it makes "412 km" appear on a
country search. Rejected as noise, though a badge that appears on some cards and not others is the
weaker part of what was chosen — see Consequences.

## Consequences

- Nothing is removed from any search. A traveller who wants Hachioji can still find it, and now
  knows it is 33 km out before clicking.
- **The badge is absent far more often than it is present**, and absence has to read as "this one
  is central" rather than as a missing field. That is the risk accepted here: an inconsistent badge
  is what made duplicate room cards look like a rendering fault
  ([ADR-0007](../../../cheapestgo-app-v2/docs/adr/0007-a-room-card-is-one-room-and-its-offers-are-its-terms.md)).
  It is tolerable only because the pattern tracks something true — Seoul shows almost none because
  its inventory genuinely is central, Tokyo shows many because its genuinely is not.
- A rung with no anchor coordinate shows nothing, so Province and Country searches are unchanged.
- **The map is still misleading and this does not fix it.** A cluster bubble marks a centroid that
  may sit on no hotel, in a city none of its members are in. Distance on the card does not help
  someone reading the map. Left open deliberately: it is a separate change to Supercluster's
  rendering, either snapping the bubble to its nearest member or naming the area it covers.
