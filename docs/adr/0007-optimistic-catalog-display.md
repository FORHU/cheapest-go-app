# ADR-0007: Optimistic Phase 1 Catalog Display

**Status:** Accepted  
**Date:** 2026-07-31

## Context

Hotel availability from OTV/TravelgateX takes 12–43 seconds to return. During that window the user would otherwise see a blank page or a loading spinner.

`hotel_content` stores a growing registry of hotel metadata (name, coordinates, images, star rating) accumulated from prior searches. For a Bangkok search, this table already holds ~300 hotels — hotels that OTV has returned for Bangkok before, but whose availability for the *current* requested dates is unknown until TGX responds.

TGX's own guidance is that only hotels returning valid `hotelX.search` options should be shown to users. Hotels in the portfolio but with no availability for the searched criteria are called **no-availability hotels** and should be suppressed.

## Decision

Show catalog hotels to the user **immediately** (Phase 1, ~10 ms) with a `priceLoading: true` flag, then **prune no-availability hotels** when TGX responds (Phase 2, 12–43 s).

The client-side stream protocol implements this as:
- `type: 'hotels'` with `source: 'catalog'` — sends all `hotel_content` rows for the city instantly, each with `priceLoading: true`
- `type: 'prices'` — patches hotels that received a TGX price; sets `priceLoading: false`
- `type: 'done'` with `tgxCount > 0` — client drops all hotels still carrying `priceLoading: true` (no-availability)
- `type: 'done'` with `tgxCount = 0` — TGX failed entirely; client clears `priceLoading` and keeps all catalog hotels rather than showing an empty page

## Consequences

**What this makes easier:**
- Users see a full, meaningful results page within ~10 ms instead of waiting up to 43 s.
- Images, names, ratings, and map pins are visible immediately from `hotel_content`.
- The search feels fast even when OTV is slow.

**What this makes harder:**
- Hotels visible in Phase 1 may disappear when Phase 2 completes, which can be jarring if the user has already started scrolling.
- The client must maintain two states per hotel: `priceLoading: true` (catalog, unconfirmed) and `priceLoading: false` (availability confirmed or TGX-failed).
- Caching results before Phase 2 completes risks persisting no-availability hotels across sessions. The cache write is guarded: results are only cached when TGX succeeded (`tgxCount > 0`) **and** at least one hotel has an image.

## Alternatives Rejected

**Wait for TGX before showing anything** — eliminated because 12–43 s blank-page latency is unacceptable UX, especially on mobile. Users abandon searches that don't respond within ~3 s.

**Show catalog without pruning** — eliminated because TGX explicitly recommends against showing no-availability hotels, and clicking an unpriced hotel leads to a dead booking flow.
