# Golf course tee-sheet control — design

**Date:** 2026-10-13
**Branch:** `feat/golf-courses`
**Status:** approved in conversation (sections 1–2); section 3 written here
**Builds on:** `2026-10-12-golf-course-staff-onboarding-design.md`, ADR-0048.

## Goal

A course runs its own tee sheet from the portal without asking the team: it edits its weekly
schedules and prices, closes days or times, and sets its extras prices. The portal today only
confirms or declines requests.

## Decisions

- **Changes apply immediately, with an audit trail.** The course is the authority on its own
  inventory. Every change is recorded (who, what, when) and visible to the team; the team can
  still override. A course cannot publish, unpublish, delete or re-zone itself.
- **A block is a date or date range with optional weekdays and an optional first/last tee time**,
  plus a private note. A narrow enough window blocks one tee time, so whole days, competitions
  and single held-back slots are one tool.
- **Bookings are never cancelled or changed.** A tee time with a held, requested or confirmed
  booking keeps its price and spots when a schedule is edited. A block or a dropped time stops
  *new* sales on it (the tee time is closed) and the bookings on it are listed for the course to
  deal with; nothing here cancels, refunds or reprices a booking.
- **Every change shows its impact first.** The same code path runs in a transaction that is rolled
  back, so the preview cannot disagree with what is applied.
- **Out of scope:** closing a day that has bookings *with automatic refunds* (piece D), the "still
  on?" re-check (piece B), editing the course profile (piece C).

## Data — migration `20261014000001_golf_tee_sheet_control.sql`

- `golf_course_blocks (id, course_id, starts_on, ends_on, weekdays smallint[] NULL,
  from_time time NULL, to_time time NULL, note, created_by, created_at)` with checks: `ends_on >=
  starts_on`, `from_time` and `to_time` both set or both null, `to_time >= from_time`.
- `golf_course_changes (id, course_id, user_id, kind, summary, details jsonb, created_at)`.
- `golf_tee_times.closed_by_block_id uuid NULL` → `golf_course_blocks(id) ON DELETE SET NULL`.
  It lets removing a block reopen exactly what it closed; tee times closed by deleting a schedule
  never reopen.

## Rules

- **Matching** is on the course's own clock: the tee time's local date within the range, its local
  weekday in `weekdays` (when set), and its local time between `from_time` and `to_time`
  inclusive (when set).
- **Adding a block** closes open, future tee times it matches, recording the block. A tee time
  that already has live bookings is closed too (nothing new is sold on it); its bookings stay and
  are reported. Tee times generated later are closed the same way (`generateTeeTimes` applies blocks).
- **Removing a block** first re-points tee times that another block still covers, reopens the
  rest, then deletes the block.
- **Editing a schedule in place** updates the row, then reconciles its future tee times that have
  no live booking: price and spots are updated; tee times the new pattern no longer produces are
  deleted (no booking history) or closed (history); missing ones are generated.
- **A published course keeps at least one schedule** (existing rule).
- **Extras** are replaced as a set, as in admin.

## Server — `src/lib/server/golf/`

`blocks.ts` (add, remove, list, apply, preview), `changes.ts` (record, list), `teeSheet.ts` (the
overview and a day's sheet), and `teeTimes.ts` gains `updateSchedule` and counted, dry-runnable
delete. Every mutating function takes `dryRun` and returns an **impact**: `{ created, updated,
closed, reopened, deleted, protectedByBookings }`.

## Routes

`GET /api/course/tee-sheet?courseId=&date=` — schedules, blocks, extras, recent changes and the
day's sheet. `POST /api/course/tee-sheet` — `{ courseId, action, preview? , … }` for
`schedule_create`, `schedule_update`, `schedule_delete`, `block_add`, `block_remove`,
`extras_set`. Guarded by `requireCourseStaff()` plus membership of `courseId`; a course that is
not theirs is `404`. The admin `golf-staff` GET also returns the course's recent changes.

## Pages

`/course` gets **Requests** and **Tee sheet** views and a course switcher. `/course/tee-sheet`:
day view, schedules, blocks, extras, history. Confirmation dialog with the impact before any
write. Golf theme, localized (en/ja/ko/zh).

## Errors

- Invalid input: `400` with `fieldErrors`. A course that is not theirs: `404`.
- No time zone: `409` ("ask the team to set it").
- Removing the last schedule of a published course: `409`.
- A block that matches nothing is allowed (it will apply to tee times generated later).
- Every write is one transaction; a failure leaves tee times exactly as they were.

## Testing

- DB integration: a block closes only unbooked tee times and applies to later generation; removing
  it reopens exactly those, and not ones another block covers; a booked tee time is untouched by
  block, price edit and pattern edit; price edit leaves a booking's price alone; pattern edit
  deletes unbooked, closes ones with history; preview equals apply and writes nothing.
- Routes: guard, scope (another course is 404), preview flag, error mapping.
- Components: each section's actions, the impact confirmation, empty and error states.
