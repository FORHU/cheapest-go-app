# Golf Course listings — design

**Date:** 2026-09-30
**Branch:** `feat/golf-courses`
**Status:** approved in conversation; first version

## Goal

Let customers browse golf courses CheapestGo can arrange play at, and ask about tee times,
without depending on any golf supplier API. The team curates the catalogue by hand from the
admin. Booking is out of scope: the only call to action is the existing support chat.

## Out of scope (v1)

- Tee-time availability, request forms, booking states, payment.
- Image upload — admins paste image URLs, as `popular_destinations` does.
- Per-language course content. Descriptions are written once, in whatever language the team
  writes them. Interface strings around them are translated (see Localization).
- Brand-specific catalogues. Every published course shows on both storefronts.
- Map, coordinates, reviews.

## Data: `golf_courses`

One dbmate migration, `db/migrations/20260930000001_golf_courses.sql`.

| column | type | notes |
|---|---|---|
| `id` | `uuid` PK | `gen_random_uuid()` |
| `slug` | `text` NOT NULL UNIQUE | URL key; lowercase `a-z0-9-` (CHECK) |
| `name` | `text` NOT NULL | |
| `country` | `text` NOT NULL | display name, e.g. "Philippines" |
| `city` | `text` NOT NULL | |
| `address` | `text` NULL | |
| `description` | `text` NOT NULL DEFAULT `''` | plain text, paragraphs split on blank lines |
| `holes` | `integer` NOT NULL | CHECK `holes IN (9, 18, 27, 36)` |
| `par` | `integer` NULL | CHECK `par BETWEEN 27 AND 144` |
| `green_fee_from` | `numeric(10,2)` NULL | indicative "from" price, never a quote; CHECK `>= 0` |
| `currency` | `char(3)` NOT NULL DEFAULT `'USD'` | |
| `image_urls` | `text[]` NOT NULL DEFAULT `'{}'` | first is the cover |
| `amenities` | `text[]` NOT NULL DEFAULT `'{}'` | codes from the vocabulary below |
| `status` | `text` NOT NULL DEFAULT `'draft'` | CHECK `status IN ('draft','published')` — open vocabulary per CONTEXT.md "Enum field" |
| `created_at`, `updated_at` | `timestamptz` NOT NULL DEFAULT `now()` | `updated_at` set by the module on update |

Index: `(status, country)` for the public list.

**Amenity vocabulary** (closed, enforced in the zod schema, not the database):
`caddie`, `cart`, `driving_range`, `putting_green`, `clubhouse`, `restaurant`, `club_rental`,
`pro_shop`, `lessons`, `night_golf`. Each has an interface-language label key.

## Server module: `src/lib/server/golf/courses.ts`

All SQL lives here (raw `getSqlAdmin()`, like `lib/server/support/*`). Pages and routes call it.

- `listPublishedCourses({ country? })` → published courses, ordered by name.
- `listPublishedCountries()` → distinct countries with at least one published course.
- `getPublishedCourseBySlug(slug)` → course or `null`. Drafts return `null`: "published only"
  is decided here once, never in a page.
- `listCoursesForAdmin({ q?, page })` → all statuses, search on name/city/country, 20 per page.
- `createCourse(input)`, `updateCourse(id, input)`, `setCourseStatus(id, status)`,
  `deleteCourse(id)`.
- A unique-violation on `slug` surfaces as a typed `SlugTakenError`.

## Validation: `src/lib/schemas/golf.ts`

zod schema `golfCourseInputSchema` shared by the admin form and the API route. Trims strings,
requires name/country/city/holes, validates URLs (`https://` only), amenity codes, currency as
3 uppercase letters. `slugify(name, city)` lives beside it: lowercase, accents stripped,
non-alphanumerics collapsed to `-`, trimmed of `-`. Empty slug input → generated.

## Admin API: `src/app/api/admin/golf-courses/route.ts`

Same shape as `api/admin/destinations`: `requireAdmin`, `rateLimit`, `logAdminAction`.

- `GET ?q=&page=` → `{ success, data, total, page, pageSize, totalPages }`.
- `POST { action: 'create' | 'update' | 'publish' | 'unpublish' | 'delete', ... }`.
- 400 with `{ success: false, error, fieldErrors }` on invalid input; 409 on `SlugTakenError`;
  404 when updating an id that does not exist.

## Admin UI: `/admin/golf`

- `src/app/admin/(dashboard)/golf/page.tsx` (server) + `GolfCoursesClient.tsx`.
- Table: cover thumbnail, name, city/country, holes, from-price, status badge, actions
  (edit, publish/unpublish, delete with confirmation). Search box; pagination like destinations.
- Create/edit in a `Dialog` (`@/components/ui/Dialog`) with `GolfCourseForm.tsx`: fields per
  the table above; amenities as checkboxes; image URLs as one-per-line textarea; slug
  pre-filled from name + city until the admin edits it. Field errors shown inline.
- English only (back office — CONTEXT.md "Interface Language").
- Sidebar: "Golf Courses" under Destinations.

## Storefront

- `src/app/(main)/golf/page.tsx` — heading, country filter (links `?country=`), card grid
  (cover image, name, city/country, holes, "Green fees from USD 85" when priced). Empty state
  when nothing is published.
- `src/app/(main)/golf/[slug]/page.tsx` — cover + thumbnail gallery, facts row, amenities,
  description, address, and **Ask about tee times**, a client button that calls
  `useSupportWidgetStore.getState().open()`. `notFound()` for unknown or draft slugs.
- Metadata + `hreflangAlternates` like the destination page.
- Images through `next/image` with `unoptimized` — admin-pasted URLs come from arbitrary hosts
  that `next.config` does not list.

## Localization

New `golf` namespace in `src/locales/{en,ja,ko,zh}.json`: page titles, filter labels, facts
("{holes} holes", "Par {par}", "Green fees from {price}"), amenity labels, CTA, empty state.
Course content (name, description) is shown as written.

## Error handling

- DB failure on public pages: let it throw to the route's error boundary (same as other
  storefront pages); no partial page.
- Admin: toast the API error message; keep the dialog open with the form state on failure.

## Testing

- `src/lib/schemas/golf.test.ts` — schema accept/reject cases; `slugify`.
- `src/lib/server/golf/courses.integration.test.ts` — gated on `DATABASE_URL` like
  `inbox.integration.test.ts`: drafts invisible to public reads, country filter, slug conflict.
- `src/app/api/admin/golf-courses/route.test.ts` — auth refusal, 400 field errors, 409, create.
- `GolfCourseForm.test.tsx` — slug auto-fill stops after manual edit; submits parsed payload.
- Storefront: `GolfCourseCard` render test; tee-time button opens the widget store.

## Docs

CONTEXT.md gains a **Golf Course** entry: curated by the team, no supplier, green fee is
indicative, the conversation is the booking channel in v1.
