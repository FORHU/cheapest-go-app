# Dense map markers are clustered, never truncated

The search map groups hotels with supercluster and draws a cluster pill where they are too dense to show individually. Every hotel is either its own marker or counted inside one; none is dropped.

It used to be dropped. One HTML `<Marker>` per hotel is what makes panning stutter — Mapbox re-transforms every marker node each frame, and a city search hands the map around a thousand of them (1,100 distinct coordinates for Seoul, 966 for Athens). The map coped by culling to the viewport and then calling `.slice(0, 100)`. That held the frame rate, but hotels inside the viewport and inside the user's own filters simply were not on the map, with nothing to indicate it. A traveller comparing a neighbourhood was reading an incomplete picture and had no way to know.

Clustering solves the same performance problem honestly: the marker count stays bounded because dense areas collapse, and the collapsed markers say how many hotels they stand for and the cheapest price among them.

## Considered options

**Mapbox GL native clustering** — a GeoJSON source with `cluster: true`, rendered in WebGL. Far faster, and it would scale past anything we throw at it. Rejected because our markers are HTML: a rounded pill with a dark-mode ring, hover and selected states, an index badge tying the marker to its position in the results list, and an enter animation. A symbol layer cannot carry that, so this would have been a visible downgrade to the product to fix an internal problem.

**Raise or remove the cap without clustering** — the simplest change, and the one that reintroduces the stutter the cap existed to prevent. The cap was not arbitrary; it was load-bearing.

## Consequences

- **Marker count is now bounded by the cluster grid rather than by a constant.** `MAX_VISIBLE_MARKERS` is gone. Nothing should reintroduce a cap: a cap is indistinguishable, to the user, from a hotel that does not exist.
- **The cluster radius is the marker-count dial, and it was set by measurement.** Replayed against captured Seoul (1,113 hotels) and Athens (996) results in a 1200px map column, the busiest viewport mounts 137 markers at radius 60, 102 at 80, and 87 at 100. 80 is the setting: it holds the peak at roughly the DOM budget the old cap of 100 was chosen for, without hiding anything to get there.
- **Supercluster owns the viewport query.** `getClusters(bbox, zoom)` is both the aggregation and the culling, so the map materialises markers only for what is on screen. The hand-rolled bounds filter it replaced is gone; `viewBounds` is now an input to the hook.
- **Zooming into a cluster is not always possible.** Hotels that share an exact coordinate never separate however far you zoom, so `getExpansionZoom` returns null for those and the map opens `MapPropertyCarousel` on the stack instead of walking to max zoom and leaving the cluster sitting there.
- **Test that case on the points, not on the expansion zoom.** Comparing the expansion zoom against `maxZoom` looks like the same test and is not: at `maxZoom` *every* surviving cluster reports an expansion zoom one step beyond it. That version condemned 398 Seoul hotels and 268 Athens ones to the list, against the handful that are genuinely stacked — a bug caught only by replaying real search results. Coincidence is now decided by comparing the leaves' coordinates.
- **`@types/supercluster` is now a dependency of v1.** app-v2 already had it; the runtime library was already installed in both and imported in neither.
- **v1 and app-v2 have diverged here.** app-v2 has no viewport culling at all and renders every marker, which is worse than what v1 had before this change. `useHotelClusters` is written to port across unchanged — both repos pin the same supercluster and react-map-gl versions.
