# Golf — publishing requires tee times — design

**Date:** 2026-10-05
**Branch:** `feat/golf-courses`
**Status:** approved in conversation
**Builds on:** `2026-10-05-golf-tee-time-booking-design.md`

## Problem

A course could be published without a time zone or a tee-time schedule. The storefront then
showed only "Ask about tee times", and nothing in admin said why. That is exactly what happened
to the four demo courses: published, but impossible to book.

## Rule

**Published means bookable.** A course is *bookable* when it has a time zone and at least one
tee-time schedule. Three server-side rules keep the two the same:

| # | Rule | Error |
|---|---|---|
| R1 | Publishing is refused unless the course is bookable. | `CourseNotBookableError` → 409 |
| R2 | A course's time zone cannot change while it has schedules (tee times were generated on that clock). This also stops a published course losing its time zone. | `TimezoneLockedError` → 409, on the `timezone` field |
| R3 | A published course's last schedule cannot be deleted; unpublish it first. | `LastScheduleError` → 409 |

Unpublishing, editing anything else, and deleting a draft's schedules are unaffected.

## Server

- `src/lib/server/golf/errors.ts` — the three errors above.
- `src/lib/server/golf/courses.ts`
  - `setCourseStatus(id, 'published')` publishes only when the course is bookable (one
    conditional `UPDATE`); otherwise throws `CourseNotBookableError`, or returns `false` for an
    unknown id.
  - `updateCourse` throws `TimezoneLockedError` when the time zone would change and the course
    has schedules.
  - `setCourseTimezone(id, timezone)` — new, for the Tee times window; same R2 guard; `null` for
    an unknown id.
  - `listCoursesForAdmin` rows carry `bookable: boolean` (`AdminGolfCourse`).
- `src/lib/server/golf/teeTimes.ts` — `deleteSchedule` throws `LastScheduleError` for the last
  schedule of a published course, checked inside its transaction.

## Admin API

- `api/admin/golf-courses`: `publish` answers `CourseNotBookableError` with 409; `update`
  answers `TimezoneLockedError` with 409 and a `timezone` field error; new action
  `set-timezone { id, timezone }` (IANA name checked with `isValidTimeZone`).
- `api/admin/golf-schedules`: `delete` answers `LastScheduleError` with 409.

## Admin UI

- **Course list:** a **Booking** column with a badge: *Bookable* (green) or *Needs tee times*
  (amber).
- **Publish on a course that needs tee times** opens the Tee times window instead of calling
  the API, with the line "Add a time zone and at least one schedule to publish this course."
- **Tee times window** (`TeeTimeSchedules`):
  - no time zone yet → a time zone field (same suggestions as the course form) and **Save time
    zone**; the schedule form stays disabled until it is saved;
  - time zone set → shown as text, with "locked while the course has schedules" when it is;
  - a draft course gets a **Publish** button, enabled once the course is bookable;
  - it keeps its own copy of the course's time zone and status, updated from the API's replies,
    and refreshes the list behind it — a course can move to another page of the list once it
    is updated, so re-reading it from the list is not reliable.
- `COMMON_TIME_ZONES` moves out of `GolfCourseForm.tsx` into an export both use.

## Demo courses (local data, once)

Not code. The four demo courses (local DB only, not in the repo) get:

| Course | Time zone | Schedule |
|---|---|---|
| Wack Wack East | Asia/Manila | daily 06:00–15:00, every 10 min, 4 spots, US$85 |
| Taiheiyo Gotemba | Asia/Tokyo | same, US$180 |
| Jack Nicklaus Korea | Asia/Seoul | same, US$260 |
| Mission Hills | Asia/Shanghai | same, US$140 |

Prices are each course's listed "green fee from". Tee times come from the
`golf-generate-tee-times` cron on the running app, so the real generation code makes them.

## Testing

- Integration (real DB): R1 refuses then allows publishing; R2 refuses a time zone change while
  schedules exist and allows it once they are gone; R3 refuses deleting a published course's last
  schedule and allows it for a draft or when another schedule remains; `bookable` in the admin list.
  Existing suites that publish courses add a schedule first.
- Route tests: the three 409s and `set-timezone` validation.
- UI: the Booking badge, and Publish on a not-bookable course opening the Tee times window
  without calling the API.
- Live: the demo courses show *Bookable* in admin and the booking panel on their pages.
