# Parity between v1 and v2 is functional, not visual

v2 keeps its own design. The Feature Port carries capabilities across — hotel and flight search, quote, prebook, book, cancel, refund, amend, policies — and leaves v1's layout, components and styling behind; v1's components are read as specifications of behaviour and never copied as markup. Slices are therefore cut along capability boundaries rather than v1 file paths, and are tracked in [port-status.md](../port-status.md).

We chose this because the two frontends had already diverged and the divergence was deliberate. v1's landing page composes eight content sections; app-v2's composes a video backdrop, an immersive search bar and a trending-destinations row, encoded and tuned in `docs/landing-video.md` with real care. Meanwhile app-v2's own CONTEXT.md described v2 as a "pixel-perfect clone" of v1 and listed "all landing sections" as in scope. The documents and the code could not both be right, and the code represented the intended product.

The rejected alternative was to replace app-v2's design with v1's, which would have discarded finished design work to gain nothing functional — v1's hero is a hero too. What v1 does have below the fold is *function*: `PopularDestinations`, `TopCities` and `TopDestinations` are indexed internal links into search, and `RecentlyViewed` and `YourRecentSearches` are returning-user conversion. Those cross the boundary as capabilities to be reimplemented in v2's design, not as components to be pasted.

## Consequences

- **A slice is judged by behaviour, not resemblance.** The Side-by-side Check compares what v1 and v2 *do* given the same input against the same database — not how they look doing it.
- **Locale routing is in scope even though it feels like presentation.** Multi-language is a capability; the markup it wraps is not. See [ADR-0015](0015-locale-lives-in-the-url.md).
- **The scope is no longer bounded by the port window.** Parity means every capability v1 has, whenever it was written — `refunds.ts`, `cancellation-engine.ts`, `policy-normalizer.ts` and `vouchers.ts` all predate 2026-08-08 and are in scope regardless.
- **v1's UI file paths stop being a useful map of the work.** They remain useful as a map of where v1's *logic* lives, which is what the reference paths in port-status.md point at.
