# Golf entry points — design

**Date:** 2026-10-02
**Branch:** `feat/golf-courses`
**Status:** approved in conversation
**Builds on:** `2026-09-30-golf-courses-design.md`

## Goal

The golf pages (`/golf`, `/golf/[slug]`) exist, but nothing in the storefront links to them; a
customer can reach them only by typing the URL. Add the entry points that make golf a visible
service.

## Out of scope

- A golf search mode in the hero. Golf has no search form; the tab is a link.
- A navbar link and a mobile bottom-nav item.
- Course pages in the sitemap (see Sitemap).
- Anything that changes the `/golf` pages themselves.

## Hero tab: `src/components/landing/hero/SearchModeToggle.tsx`

Tabs become **Stays · Flights · Golf · AI search**. Golf is a `next/link` to `/golf`, styled as
an inactive tab, with the lucide `Flag` icon (the same icon the course card and admin sidebar
use). It is not a `SearchMode`: the store, its persisted `searchMode`, and `onModeChange` are
untouched. Copy key `landing.search.searchMode.golf`.

Four tabs must fit at 360px wide. If they overflow, tighten the mobile tab padding.

## Home section

- `listNewestPublishedCourses(limit)` in `src/lib/server/golf/courses.ts` — published courses,
  `created_at DESC`, `LIMIT limit`. Newest first so a course an admin just published shows up.
- `GolfCoursesSection({ courses })` in `src/components/golf/GolfCoursesSection.tsx` — a server
  component: `h2` title, subtitle, "See all golf courses" link to `/golf`, and the cards. Cards
  scroll horizontally with snap on mobile and sit in a 2-/4-column grid from `sm`/`lg`. Renders
  nothing when `courses` is empty.
- `GolfCourseCard` gains `titleAs?: 'h2' | 'h3'` (default `h2`); the section passes `h3`.
- `GolfSectionStream` in `src/app/(main)/_sections.tsx` fetches 4 courses and renders the
  section. On a query error it logs `[Landing] golf_courses error:` and renders nothing.
- `src/app/(main)/page.tsx` places it after the Deals section in `<Suspense fallback={null}>` —
  no skeleton, because the section may legitimately not exist.

Copy keys `golf.homeTitle`, `golf.homeSubtitle`, `golf.seeAll`.

## Footer: `src/components/landing/layout/Footer.tsx`

A "Golf" link to `/golf` in the Module column, after Hotels. Copy key `footer.golf`.

## Sitemap: `src/app/sitemap.ts`

`localeVariants('/golf', { changeFrequency: 'weekly', priority: 0.7 })`. Course pages are not
listed: `src/__tests__/common/sitemap.test.ts` deliberately rejects any URL whose route is
dynamic, after `/destinations/[slug]` URLs built from a second list all 404'd. Crawlers reach
course pages through `/golf` and the home section. The sitemap stays synchronous.

## Localization

Every new key in en, ja, ko and zh; `src/locales` parity test stays green.

## Consequence

The hero tab and footer link always show. With nothing published they lead to the `/golf` empty
state, so publish at least one course before this ships.

## Testing

- `GolfCoursesSection`: nothing rendered for `[]`; cards plus a `/golf` link otherwise; card
  titles are `h3`.
- `SearchModeToggle`: Golf is a link to `/golf`; clicking it does not call `onModeChange`.
- Sitemap: contains `/golf` for every served locale; the existing orphan guard passes.
- Integration (`courses.integration.test.ts`): newest-first, published-only, limit respected.
- Manual: home page screenshots at desktop and 360px.
