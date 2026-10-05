# Golf Tee-Time Booking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Customers pick a real tee time on a course page, authorise payment, and the team confirms with the course in admin, which captures the payment.

**Architecture:** Schedules per course generate `golf_tee_times` rows with a capacity. A booking starts as a `held` row created in the same transaction as a conditional `spots_left` decrement, gets a manual-capture Stripe PaymentIntent, becomes `requested` when the card is authorised (webhook or status page), and `confirmed` when the team captures. Pure rules live in `src/lib/golf/`, all SQL in `src/lib/server/golf/`. Spec: `docs/superpowers/specs/2026-10-05-golf-tee-time-booking-design.md`.

**Tech Stack:** Next.js 15 App Router, next-intl, postgres.js (`getSqlAdmin`), dbmate, Stripe (manual capture), zod 4, Tailwind v4, Vitest + Testing Library (happy-dom).

**Code blocks:** a fence whose info string carries `file=<path>` is the complete content of that file. Steps that change part of an existing file show the exact snippet to replace or insert.

**Running integration tests:** they skip when no database is reachable. To run them against the local v1 database:
`DATABASE_URL=$(grep '^DATABASE_URL=' .env | cut -d= -f2-) npx vitest run <file>`

---

## File map

| File | Change |
| --- | --- |
| `db/migrations/20261005000001_golf_tee_time_booking.sql` | new — course columns, schedules, tee times, bookings, email types |
| `src/lib/golf/time.ts` (+ test) | new — course-local time via `Intl` |
| `src/lib/golf/schedule.ts` (+ test) | new — schedule → tee-time instants |
| `src/lib/golf/rules.ts` (+ test) | new — hold/lead/horizon/deadline/cancellation rules |
| `src/lib/schemas/golf.ts` (+ test) | course `timezone`/`freeCancelHours`; schedule + hold schemas; booking types |
| `src/lib/server/golf/courses.ts` | read/write the two new course columns; FK violation on delete → `CourseHasBookingsError` |
| `src/lib/server/golf/errors.ts` | `CourseHasBookingsError`, `CourseNotSchedulableError`, `GolfBookingError` |
| `src/lib/pricing.ts`, `src/lib/pricing-golf.test.ts` | `GOLF_MARKUP_SPEC`, `golfServiceFee` |
| `src/lib/server/golf/teeTimes.ts` (+ integration test) | new — schedules, generation, availability |
| `src/lib/server/email.ts` | export `logEmail`; golf email types |
| `src/lib/server/golf/emails.ts` (+ test) | new — four status emails |
| `src/lib/server/golf/bookings.ts` (+ integration test) | new — hold, sync, confirm, decline, cancel, sweep |
| `src/app/api/golf/courses/[slug]/tee-times/route.ts` (+ test) | new |
| `src/app/api/golf/bookings/route.ts` (+ test) | new |
| `src/app/api/golf/bookings/[reference]/cancel/route.ts` (+ test) | new |
| `src/app/api/admin/golf-schedules/route.ts` (+ test) | new |
| `src/app/api/admin/golf-bookings/route.ts` (+ test) | new |
| `src/app/api/admin/golf-courses/route.ts` (+ test) | 409 on `CourseHasBookingsError` |
| `src/app/api/cron/golf-sweep/route.ts`, `src/app/api/cron/golf-generate-tee-times/route.ts` (+ test) | new |
| `src/app/api/webhooks/stripe/route.ts` | golf branch in `amount_capturable_updated` |
| `docker/cron/crontab`, `src/app/api/admin/run-cron/route.ts`, `src/app/admin/(dashboard)/crons/CronsClient.tsx` | schedule + register the two crons |
| `src/components/golf/TeeTimePicker.tsx` (+ test) | new — course-page panel |
| `src/components/golf/CancelGolfBookingButton.tsx` | new |
| `src/app/(main)/golf/[slug]/page.tsx` | show the picker when the course has schedules |
| `src/app/(main)/golf/[slug]/book/page.tsx`, `BookTeeTimeClient.tsx` | new — checkout |
| `src/app/(main)/golf/bookings/[reference]/page.tsx` | new — status page |
| `src/app/admin/(dashboard)/golf/GolfCourseForm.tsx` (+ test) | time zone + free-cancellation hours |
| `src/app/admin/(dashboard)/golf/TeeTimeSchedules.tsx` | new — schedules dialog body |
| `src/app/admin/(dashboard)/golf/GolfCoursesClient.tsx` | Tee times action, Bookings link |
| `src/app/admin/(dashboard)/golf/bookings/page.tsx`, `GolfBookingsClient.tsx` | new — bookings queue |
| `src/components/admin/Sidebar.tsx` | Golf Bookings entry |
| `src/components/golf/golf.test.tsx` | fixture gains the two course fields |
| `src/locales/{en,ja,ko,zh}.json` | `golf.booking.*` |
| `CONTEXT.md` | Golf Course updated; Tee Time, Golf Booking added |

---

### Task 1: Migration

**Files:** Create `db/migrations/20261005000001_golf_tee_time_booking.sql`

- [ ] **Step 1: Write the migration**

```sql file=db/migrations/20261005000001_golf_tee_time_booking.sql
-- migrate:up
-- Tee-time booking for Golf Courses (CONTEXT.md, "Tee Time", "Golf Booking"). Our tee times
-- are not the course's own tee sheet, so a booking is a request until the team confirms it
-- with the course: the card is authorised at checkout and captured on confirmation.

ALTER TABLE public.golf_courses
    ADD COLUMN IF NOT EXISTS timezone text,
    ADD COLUMN IF NOT EXISTS free_cancel_hours integer NOT NULL DEFAULT 48;

ALTER TABLE public.golf_courses
    ADD CONSTRAINT golf_courses_free_cancel_hours_check CHECK (free_cancel_hours BETWEEN 0 AND 720);

CREATE TABLE IF NOT EXISTS public.golf_tee_time_schedules (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id        uuid NOT NULL REFERENCES public.golf_courses(id) ON DELETE CASCADE,
    name             text NOT NULL,
    -- 0 = Sunday … 6 = Saturday, on the course's clock.
    days_of_week     smallint[] NOT NULL,
    first_tee        time NOT NULL,
    last_tee         time NOT NULL,
    interval_minutes integer NOT NULL,
    spots            integer NOT NULL DEFAULT 4,
    price_per_player numeric(10,2) NOT NULL,
    created_at       timestamp with time zone NOT NULL DEFAULT now(),
    updated_at       timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT golf_schedules_days_check
        CHECK (cardinality(days_of_week) > 0 AND days_of_week <@ ARRAY[0,1,2,3,4,5,6]::smallint[]),
    CONSTRAINT golf_schedules_tee_range_check CHECK (last_tee >= first_tee),
    CONSTRAINT golf_schedules_interval_check CHECK (interval_minutes BETWEEN 5 AND 60),
    CONSTRAINT golf_schedules_spots_check CHECK (spots BETWEEN 1 AND 4),
    CONSTRAINT golf_schedules_price_check CHECK (price_per_player >= 0)
);

CREATE INDEX IF NOT EXISTS idx_golf_schedules_course ON public.golf_tee_time_schedules (course_id);

CREATE TABLE IF NOT EXISTS public.golf_tee_times (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id        uuid NOT NULL REFERENCES public.golf_courses(id) ON DELETE CASCADE,
    schedule_id      uuid REFERENCES public.golf_tee_time_schedules(id) ON DELETE SET NULL,
    starts_at        timestamp with time zone NOT NULL,
    spots            integer NOT NULL,
    -- Moved only by the conditional decrement in lib/server/golf/bookings and the releases
    -- beside it, always in the same transaction as the booking status that explains it.
    spots_left       integer NOT NULL,
    price_per_player numeric(10,2) NOT NULL,
    currency         char(3) NOT NULL,
    status           text NOT NULL DEFAULT 'open',
    created_at       timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT golf_tee_times_course_start_key UNIQUE (course_id, starts_at),
    CONSTRAINT golf_tee_times_spots_check CHECK (spots BETWEEN 1 AND 4),
    CONSTRAINT golf_tee_times_spots_left_check CHECK (spots_left BETWEEN 0 AND spots),
    CONSTRAINT golf_tee_times_price_check CHECK (price_per_player >= 0),
    CONSTRAINT golf_tee_times_status_check CHECK (status IN ('open', 'closed'))
);

CREATE TABLE IF NOT EXISTS public.golf_bookings (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reference         text NOT NULL,
    user_id           uuid NOT NULL REFERENCES public.users(id),
    course_id         uuid NOT NULL REFERENCES public.golf_courses(id) ON DELETE RESTRICT,
    tee_time_id       uuid NOT NULL REFERENCES public.golf_tee_times(id) ON DELETE RESTRICT,
    players           integer NOT NULL,
    lead_name         text NOT NULL,
    contact_email     text NOT NULL,
    price_per_player  numeric(10,2) NOT NULL,
    green_fee_total   numeric(10,2) NOT NULL,
    service_fee       numeric(10,2) NOT NULL,
    total             numeric(10,2) NOT NULL,
    currency          char(3) NOT NULL,
    payment_intent_id text,
    status            text NOT NULL DEFAULT 'held',
    hold_expires_at   timestamp with time zone NOT NULL,
    requested_at      timestamp with time zone,
    decide_by         timestamp with time zone,
    confirmed_at      timestamp with time zone,
    closed_at         timestamp with time zone,
    close_reason      text,
    refund_amount     numeric(10,2) NOT NULL DEFAULT 0,
    -- Recorded when the booking is made, so a later change to the course's rule never
    -- changes what this customer was promised (ADR-0023).
    free_cancel_until timestamp with time zone NOT NULL,
    created_at        timestamp with time zone NOT NULL DEFAULT now(),
    updated_at        timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT golf_bookings_reference_key UNIQUE (reference),
    CONSTRAINT golf_bookings_payment_intent_key UNIQUE (payment_intent_id),
    CONSTRAINT golf_bookings_players_check CHECK (players BETWEEN 1 AND 4),
    CONSTRAINT golf_bookings_status_check
        CHECK (status IN ('held', 'requested', 'confirmed', 'expired', 'declined', 'cancelled')),
    CONSTRAINT golf_bookings_close_reason_check
        CHECK (close_reason IS NULL OR close_reason IN (
            'hold_expired', 'declined_by_team', 'not_confirmed_in_time',
            'cancelled_by_customer', 'cancelled_by_team'))
);

-- One live hold per customer per tee time: a repeated request finds the hold it already has.
CREATE UNIQUE INDEX IF NOT EXISTS uq_golf_bookings_live_hold
    ON public.golf_bookings (user_id, tee_time_id) WHERE status = 'held';
CREATE INDEX IF NOT EXISTS idx_golf_bookings_status_decide_by ON public.golf_bookings (status, decide_by);
CREATE INDEX IF NOT EXISTS idx_golf_bookings_user ON public.golf_bookings (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_golf_bookings_tee_time ON public.golf_bookings (tee_time_id);

ALTER TABLE public.email_logs DROP CONSTRAINT IF EXISTS email_logs_email_type_check;
ALTER TABLE public.email_logs ADD CONSTRAINT email_logs_email_type_check CHECK (email_type = ANY (ARRAY[
    'confirmation', 'ticketed', 'refund', 'cancellation', 'awaiting_ticket', 'price_alert',
    'support_escalation', 'golf_requested', 'golf_confirmed', 'golf_declined', 'golf_cancelled']));

-- migrate:down
DELETE FROM public.email_logs WHERE email_type LIKE 'golf\_%';
ALTER TABLE public.email_logs DROP CONSTRAINT IF EXISTS email_logs_email_type_check;
ALTER TABLE public.email_logs ADD CONSTRAINT email_logs_email_type_check CHECK (email_type = ANY (ARRAY[
    'confirmation', 'ticketed', 'refund', 'cancellation', 'awaiting_ticket', 'price_alert',
    'support_escalation']));
DROP TABLE IF EXISTS public.golf_bookings;
DROP TABLE IF EXISTS public.golf_tee_times;
DROP TABLE IF EXISTS public.golf_tee_time_schedules;
ALTER TABLE public.golf_courses DROP CONSTRAINT IF EXISTS golf_courses_free_cancel_hours_check;
ALTER TABLE public.golf_courses DROP COLUMN IF EXISTS free_cancel_hours, DROP COLUMN IF EXISTS timezone;
```

- [ ] **Step 2: Apply locally** (the local DB has unrelated pending migrations, so apply this file directly, as the golf-courses plan did):

```bash
sed -n '/-- migrate:up/,/-- migrate:down/p' db/migrations/20261005000001_golf_tee_time_booking.sql \
  | docker exec -i cheapest-go-app-postgres-1 sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```
Expected: `ALTER TABLE` ×2, `CREATE TABLE` ×3, `CREATE INDEX` ×5, `ALTER TABLE` ×2, no `ERROR`.

- [ ] **Step 3: Commit** — `git add db/migrations/20261005000001_golf_tee_time_booking.sql && git commit -m "feat(golf): tee-time booking tables"`

---

### Task 2: Course-local time

**Files:** Create `src/lib/golf/time.ts`, Test `src/lib/golf/time.test.ts`

- [ ] **Step 1: Failing test**

```ts file=src/lib/golf/time.test.ts
import { describe, it, expect } from 'vitest';
import { addDays, dayOfWeek, isIsoDate, isValidTimeZone, localDate, localTime, zonedTimeToUtc } from './time';

describe('isValidTimeZone', () => {
    it('accepts IANA names and refuses anything else', () => {
        expect(isValidTimeZone('Asia/Manila')).toBe(true);
        expect(isValidTimeZone('America/New_York')).toBe(true);
        expect(isValidTimeZone('Mars/Olympus_Mons')).toBe(false);
        expect(isValidTimeZone('')).toBe(false);
    });
});

describe('isIsoDate', () => {
    it('accepts real calendar dates only', () => {
        expect(isIsoDate('2026-10-10')).toBe(true);
        expect(isIsoDate('2026-02-30')).toBe(false);
        expect(isIsoDate('10/10/2026')).toBe(false);
    });
});

describe('zonedTimeToUtc', () => {
    it('reads a wall-clock time in a zone without daylight saving', () => {
        expect(zonedTimeToUtc('2026-10-10', '07:38', 'Asia/Manila').toISOString()).toBe('2026-10-09T23:38:00.000Z');
    });

    it('follows the offset either side of a daylight-saving change', () => {
        expect(zonedTimeToUtc('2026-03-07', '07:00', 'America/New_York').toISOString()).toBe('2026-03-07T12:00:00.000Z');
        expect(zonedTimeToUtc('2026-03-09', '07:00', 'America/New_York').toISOString()).toBe('2026-03-09T11:00:00.000Z');
    });

    it('moves a time the clocks skip to just after the jump', () => {
        // 02:30 does not exist in New York on 8 March 2026; 03:30 EDT does.
        expect(zonedTimeToUtc('2026-03-08', '02:30', 'America/New_York').toISOString()).toBe('2026-03-08T07:30:00.000Z');
    });

    it('takes the first of a time the clocks repeat', () => {
        expect(zonedTimeToUtc('2026-11-01', '01:30', 'America/New_York').toISOString()).toBe('2026-11-01T05:30:00.000Z');
    });
});

describe('localDate / localTime', () => {
    it('reads an instant on the course clock', () => {
        const instant = new Date('2026-10-09T23:38:00Z');
        expect(localDate(instant, 'Asia/Manila')).toBe('2026-10-10');
        expect(localTime(instant, 'Asia/Manila')).toBe('07:38');
    });
});

describe('addDays / dayOfWeek', () => {
    it('does calendar arithmetic across month and year ends', () => {
        expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
        expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    });

    it('numbers days from Sunday', () => {
        expect(dayOfWeek('2026-10-10')).toBe(6);
        expect(dayOfWeek('2026-10-11')).toBe(0);
    });
});
```

- [ ] **Step 2: Run, expect FAIL** — `npx vitest run src/lib/golf/time.test.ts` → "Failed to resolve import './time'".

- [ ] **Step 3: Implement**

```ts file=src/lib/golf/time.ts
/**
 * Course-local time without a date library (CONTEXT.md, "Tee Time"). A tee time is set on the
 * course's own clock ("07:38 in Manila") and stored as an instant, so every conversion goes
 * through the course's IANA time zone. Client-safe.
 */

const pad = (n: number) => String(n).padStart(2, '0');

export function isValidTimeZone(tz: string): boolean {
    if (!tz) return false;
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: tz });
        return true;
    } catch {
        return false;
    }
}

/** A real calendar date written "YYYY-MM-DD". */
export function isIsoDate(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [y, m, d] = value.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function wallClock(instant: number, tz: string) {
    let format = formatters.get(tz);
    if (!format) {
        format = new Intl.DateTimeFormat('en-US', {
            timeZone: tz, hourCycle: 'h23',
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
        });
        formatters.set(tz, format);
    }
    const fields: Record<string, number> = {};
    for (const part of format.formatToParts(new Date(instant))) {
        if (part.type !== 'literal') fields[part.type] = Number(part.value);
    }
    return fields as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

/** Milliseconds the clock in `tz` is ahead of UTC at `instant`. */
function offsetMs(instant: number, tz: string): number {
    const w = wallClock(instant, tz);
    return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) - Math.floor(instant / 1000) * 1000;
}

/**
 * The instant at which the clock in `tz` reads `date` `time` ("2026-10-10", "07:38").
 * A time skipped by a daylight-saving jump lands just after the jump; a time that happens
 * twice resolves to its first occurrence.
 */
export function zonedTimeToUtc(date: string, time: string, tz: string): Date {
    const [y, m, d] = date.split('-').map(Number);
    const [hh, mm] = time.split(':').map(Number);
    const wall = Date.UTC(y, m - 1, d, hh, mm);
    const first = wall - offsetMs(wall, tz);
    const second = wall - offsetMs(first, tz);
    // Agreeing offsets mean `second` really reads `time`. Disagreeing ones mean the time falls
    // in a gap, and the later candidate is the instant just after the clocks jumped.
    return new Date(offsetMs(second, tz) === offsetMs(first, tz) ? second : Math.max(first, second));
}

/** The course-local calendar date ("2026-10-10") of `instant`. */
export function localDate(instant: Date, tz: string): string {
    const w = wallClock(instant.getTime(), tz);
    return `${w.year}-${pad(w.month)}-${pad(w.day)}`;
}

/** "07:38" on the course's clock. */
export function localTime(instant: Date, tz: string): string {
    const w = wallClock(instant.getTime(), tz);
    return `${pad(w.hour)}:${pad(w.minute)}`;
}

/** Calendar arithmetic on "YYYY-MM-DD"; no zone involved. */
export function addDays(date: string, days: number): string {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(date: string): number {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
```

- [ ] **Step 4: Run, expect PASS** — `npx vitest run src/lib/golf/time.test.ts`

- [ ] **Step 5: Commit** — `git add src/lib/golf/time.ts src/lib/golf/time.test.ts && git commit -m "feat(golf): course-local time helpers"`

---

### Task 3: Schedule expansion

**Files:** Create `src/lib/golf/schedule.ts`, Test `src/lib/golf/schedule.test.ts`

- [ ] **Step 1: Failing test**

```ts file=src/lib/golf/schedule.test.ts
import { describe, it, expect } from 'vitest';
import { expandSchedule } from './schedule';

const iso = (dates: Date[]) => dates.map(d => d.toISOString());

describe('expandSchedule', () => {
    it('produces each tee time from first to last on the scheduled days only', () => {
        // Saturday 10 Oct 2026 → Sat, Sun skipped, Mon 12 Oct kept.
        const weekdays = { daysOfWeek: [1, 2, 3, 4, 5], firstTee: '06:00', lastTee: '06:30', intervalMinutes: 10 };
        expect(iso(expandSchedule(weekdays, 'Asia/Manila', '2026-10-10', 3))).toEqual([
            '2026-10-11T22:00:00.000Z', '2026-10-11T22:10:00.000Z',
            '2026-10-11T22:20:00.000Z', '2026-10-11T22:30:00.000Z',
        ]);
    });

    it('stops at the last tee even when the interval does not land on it', () => {
        const odd = { daysOfWeek: [1], firstTee: '06:00', lastTee: '06:25', intervalMinutes: 10 };
        expect(expandSchedule(odd, 'Asia/Manila', '2026-10-12', 1)).toHaveLength(3);
    });

    it('keeps the local time across a daylight-saving change', () => {
        const daily = { daysOfWeek: [0, 1, 2, 3, 4, 5, 6], firstTee: '07:00', lastTee: '07:00', intervalMinutes: 10 };
        expect(iso(expandSchedule(daily, 'America/New_York', '2026-03-07', 3))).toEqual([
            '2026-03-07T12:00:00.000Z', '2026-03-08T11:00:00.000Z', '2026-03-09T11:00:00.000Z',
        ]);
    });

    it('accepts times as Postgres prints them', () => {
        const pg = { daysOfWeek: [1], firstTee: '06:00:00', lastTee: '06:00:00', intervalMinutes: 10 };
        expect(expandSchedule(pg, 'Asia/Manila', '2026-10-12', 1)).toHaveLength(1);
    });
});
```

- [ ] **Step 2: Run, expect FAIL** — `npx vitest run src/lib/golf/schedule.test.ts`

- [ ] **Step 3: Implement**

```ts file=src/lib/golf/schedule.ts
import { addDays, dayOfWeek, zonedTimeToUtc } from './time';

/** The parts of a tee-time schedule that decide when its tee times are. */
export interface ScheduleShape {
    /** 0 = Sunday … 6 = Saturday, on the course's clock. */
    daysOfWeek: number[];
    /** "HH:MM" (or Postgres's "HH:MM:SS"), course-local. */
    firstTee: string;
    lastTee: string;
    intervalMinutes: number;
}

const minutesOf = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
};
const hhmm = (minutes: number) =>
    `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/**
 * Every tee time a schedule produces on `days` course-local dates starting at `fromDate`, as
 * instants: the first tee, then every `intervalMinutes` up to and including the last tee.
 */
export function expandSchedule(schedule: ScheduleShape, tz: string, fromDate: string, days: number): Date[] {
    const first = minutesOf(schedule.firstTee);
    const last = minutesOf(schedule.lastTee);
    const out: Date[] = [];
    for (let i = 0; i < days; i++) {
        const date = addDays(fromDate, i);
        if (!schedule.daysOfWeek.includes(dayOfWeek(date))) continue;
        for (let t = first; t <= last; t += schedule.intervalMinutes) {
            out.push(zonedTimeToUtc(date, hhmm(t), tz));
        }
    }
    return out;
}
```

- [ ] **Step 4: Run, expect PASS** — `npx vitest run src/lib/golf/schedule.test.ts`

- [ ] **Step 5: Commit** — `git add src/lib/golf/schedule.ts src/lib/golf/schedule.test.ts && git commit -m "feat(golf): expand a schedule into tee times"`

---

### Task 4: Schemas and types

**Files:** Modify `src/lib/schemas/golf.ts` (whole file below), Test `src/lib/schemas/golf.test.ts` (append), Modify `src/components/golf/golf.test.tsx` (fixture)

- [ ] **Step 1: Failing tests** — append to `src/lib/schemas/golf.test.ts`:

```ts
import { golfCourseInputSchema as courseSchema, teeTimeScheduleInputSchema, holdRequestSchema } from './golf';

describe('course time zone and free cancellation', () => {
    const base = { name: 'Wack Wack', country: 'Philippines', city: 'Manila', holes: 18 };

    it('defaults to no time zone and 48 hours', () => {
        const parsed = courseSchema.parse(base);
        expect(parsed.timezone).toBeNull();
        expect(parsed.freeCancelHours).toBe(48);
    });

    it('accepts an IANA zone and refuses an invented one', () => {
        expect(courseSchema.parse({ ...base, timezone: 'Asia/Manila' }).timezone).toBe('Asia/Manila');
        expect(courseSchema.safeParse({ ...base, timezone: 'Manila time' }).success).toBe(false);
    });
});

describe('teeTimeScheduleInputSchema', () => {
    const schedule = { name: 'Weekday mornings', daysOfWeek: [5, 1, 1, 3], firstTee: '06:00', lastTee: '11:00', intervalMinutes: 10, pricePerPlayer: 2500 };

    it('dedupes and sorts days, defaults to four spots', () => {
        const parsed = teeTimeScheduleInputSchema.parse(schedule);
        expect(parsed.daysOfWeek).toEqual([1, 3, 5]);
        expect(parsed.spots).toBe(4);
    });

    it('refuses a last tee before the first, and no days', () => {
        expect(teeTimeScheduleInputSchema.safeParse({ ...schedule, lastTee: '05:00' }).success).toBe(false);
        expect(teeTimeScheduleInputSchema.safeParse({ ...schedule, daysOfWeek: [] }).success).toBe(false);
        expect(teeTimeScheduleInputSchema.safeParse({ ...schedule, firstTee: '6am' }).success).toBe(false);
    });
});

describe('holdRequestSchema', () => {
    it('needs a tee time id, 1–4 players and a lead name', () => {
        const ok = { teeTimeId: '6f1c2e0a-9b7d-4c1e-a2f5-3d8e1b0c7a44', players: 2, leadName: ' Ana Cruz ' };
        expect(holdRequestSchema.parse(ok).leadName).toBe('Ana Cruz');
        expect(holdRequestSchema.safeParse({ ...ok, players: 5 }).success).toBe(false);
        expect(holdRequestSchema.safeParse({ ...ok, leadName: '' }).success).toBe(false);
    });
});
```

- [ ] **Step 2: Run, expect FAIL** — `npx vitest run src/lib/schemas/golf.test.ts`

- [ ] **Step 3: Implement**

```ts file=src/lib/schemas/golf.ts
import { z } from 'zod';
import { isValidTimeZone } from '@/lib/golf/time';

/**
 * Golf (CONTEXT.md, "Golf Course", "Tee Time", "Golf Booking"). Client-safe: types, the input
 * schemas the admin forms, the API and the checkout share, and the slug rule. Queries live in
 * lib/server/golf.
 */

export const GOLF_AMENITIES = [
    'caddie', 'cart', 'driving_range', 'putting_green', 'clubhouse',
    'restaurant', 'club_rental', 'pro_shop', 'lessons', 'night_golf',
] as const;
export type GolfAmenity = (typeof GOLF_AMENITIES)[number];

export const GOLF_HOLES = [9, 18, 27, 36] as const;

export type GolfCourseStatus = 'draft' | 'published';

export interface GolfCourse {
    id: string;
    slug: string;
    name: string;
    country: string;
    city: string;
    address: string | null;
    description: string;
    holes: number;
    par: number | null;
    /** Indicative "from" price for the listing — never a quote. */
    greenFeeFrom: number | null;
    currency: string;
    /** First is the cover. */
    imageUrls: string[];
    amenities: GolfAmenity[];
    status: GolfCourseStatus;
    /** IANA zone the course's tee times are set in; null until an admin sets it. */
    timezone: string | null;
    /** Free cancellation ends this many hours before a tee time. */
    freeCancelHours: number;
}

/** Lowercase a-z0-9 words joined by single hyphens; '' when nothing latin survives. */
export function slugify(...parts: string[]): string {
    return parts
        .join(' ')
        .normalize('NFKD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 120)
        .replace(/-+$/, '');
}

const requiredText = (label: string, max: number) =>
    z.string().trim().min(1, `${label} is required`).max(max, `${label} is too long`);

export const golfCourseInputSchema = z
    .object({
        name: requiredText('Name', 120),
        country: requiredText('Country', 80),
        city: requiredText('City', 80),
        slug: z.string().trim().max(120).optional().default(''),
        address: z.string().trim().max(300).nullish().transform(v => v || null),
        description: z.string().trim().max(10_000).optional().default(''),
        holes: z.number().int().refine(v => (GOLF_HOLES as readonly number[]).includes(v), 'Holes must be 9, 18, 27 or 36'),
        par: z.number().int().min(27, 'Par must be between 27 and 144').max(144, 'Par must be between 27 and 144').nullish().transform(v => v ?? null),
        greenFeeFrom: z.number().min(0, 'Green fee cannot be negative').max(100_000).nullish().transform(v => v ?? null),
        currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Currency must be a 3-letter code').optional().default('USD'),
        imageUrls: z
            .array(z.string().trim().url('Not a valid URL').refine(u => u.startsWith('https://'), 'Image URLs must start with https://'))
            .max(20, 'At most 20 images')
            .optional()
            .default([]),
        amenities: z.array(z.enum(GOLF_AMENITIES)).optional().default([]).transform(a => [...new Set(a)]),
        timezone: z
            .string()
            .trim()
            .nullish()
            .transform(v => v || null)
            .refine(v => v === null || isValidTimeZone(v), 'Use a time zone name such as Asia/Manila'),
        freeCancelHours: z.number().int().min(0, 'Between 0 and 720 hours').max(720, 'Between 0 and 720 hours').optional().default(48),
    })
    .transform(v => ({ ...v, slug: v.slug ? slugify(v.slug) : slugify(v.name, v.city) }))
    .refine(v => v.slug.length > 0, {
        path: ['slug'],
        message: 'Enter a slug using a-z, 0-9 and hyphens',
    });

/** What the form sends. */
export type GolfCourseInputRaw = z.input<typeof golfCourseInputSchema>;
/** What the database module accepts. */
export type GolfCourseInput = z.output<typeof golfCourseInputSchema>;

// ── Tee times ────────────────────────────────────────────────────────────────

const timeOfDay = z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour time, e.g. 06:30');

/** A weekly pattern of tee times. Different prices for different times of day are separate schedules. */
export const teeTimeScheduleInputSchema = z
    .object({
        name: requiredText('Name', 80),
        daysOfWeek: z
            .array(z.number().int().min(0).max(6))
            .min(1, 'Pick at least one day')
            .transform(days => [...new Set(days)].sort((a, b) => a - b)),
        firstTee: timeOfDay,
        lastTee: timeOfDay,
        intervalMinutes: z.number().int().min(5, 'Between 5 and 60 minutes').max(60, 'Between 5 and 60 minutes'),
        spots: z.number().int().min(1, 'Between 1 and 4').max(4, 'Between 1 and 4').optional().default(4),
        pricePerPlayer: z.number().min(0, 'Price cannot be negative').max(100_000),
    })
    .refine(v => v.lastTee >= v.firstTee, { path: ['lastTee'], message: 'Last tee must be at or after the first' });

export type TeeTimeScheduleInputRaw = z.input<typeof teeTimeScheduleInputSchema>;
export type TeeTimeScheduleInput = z.output<typeof teeTimeScheduleInputSchema>;

export interface TeeTimeSchedule {
    id: string;
    courseId: string;
    name: string;
    daysOfWeek: number[];
    /** "HH:MM", course-local. */
    firstTee: string;
    lastTee: string;
    intervalMinutes: number;
    spots: number;
    pricePerPlayer: number;
}

export interface TeeTime {
    id: string;
    /** ISO instant. */
    startsAt: string;
    /** "07:38" on the course's clock. */
    localTime: string;
    spots: number;
    spotsLeft: number;
    pricePerPlayer: number;
    currency: string;
}

// ── Bookings ─────────────────────────────────────────────────────────────────

export const holdRequestSchema = z.object({
    teeTimeId: z.string().uuid(),
    players: z.number().int().min(1).max(4),
    leadName: requiredText('Lead player name', 120),
});

export type GolfBookingStatus = 'held' | 'requested' | 'confirmed' | 'expired' | 'declined' | 'cancelled';

export type GolfCloseReason =
    | 'hold_expired' | 'declined_by_team' | 'not_confirmed_in_time'
    | 'cancelled_by_customer' | 'cancelled_by_team';

/** Instants are ISO strings so a booking crosses the server/client boundary as it is. */
export interface GolfBooking {
    id: string;
    reference: string;
    userId: string;
    courseId: string;
    courseName: string;
    courseSlug: string;
    timezone: string | null;
    teeTimeId: string;
    startsAt: string;
    players: number;
    leadName: string;
    contactEmail: string;
    pricePerPlayer: number;
    greenFeeTotal: number;
    serviceFee: number;
    total: number;
    currency: string;
    paymentIntentId: string | null;
    status: GolfBookingStatus;
    holdExpiresAt: string;
    requestedAt: string | null;
    decideBy: string | null;
    confirmedAt: string | null;
    closedAt: string | null;
    closeReason: GolfCloseReason | null;
    refundAmount: number;
    freeCancelUntil: string;
}
```

- [ ] **Step 4: Fixture** — in `src/components/golf/golf.test.tsx` replace

```ts
    imageUrls: [], amenities: [], status: 'published',
};
```
with
```ts
    imageUrls: [], amenities: [], status: 'published', timezone: null, freeCancelHours: 48,
};
```

- [ ] **Step 5: Run, expect PASS** — `npx vitest run src/lib/schemas/golf.test.ts src/components/golf/golf.test.tsx`

- [ ] **Step 6: Commit** — `git add src/lib/schemas/golf.ts src/lib/schemas/golf.test.ts src/components/golf/golf.test.tsx && git commit -m "feat(golf): schedule, hold and booking schemas"`

---

### Task 5: Booking rules

**Files:** Create `src/lib/golf/rules.ts`, Test `src/lib/golf/rules.test.ts`

- [ ] **Step 1: Failing test**

```ts file=src/lib/golf/rules.test.ts
import { describe, it, expect } from 'vitest';
import { cancellationFor, decideBy, freeCancelUntil, holdExpiresAt, isBookableStart } from './rules';

const at = (iso: string) => new Date(iso);

describe('holdExpiresAt', () => {
    it('is fifteen minutes on', () => {
        expect(holdExpiresAt(at('2026-10-06T10:00:00Z')).toISOString()).toBe('2026-10-06T10:15:00.000Z');
    });
});

describe('decideBy', () => {
    it('gives the team 48 hours when the tee time is far off', () => {
        expect(decideBy(at('2026-10-06T10:00:00Z'), at('2026-10-20T00:00:00Z')).toISOString()).toBe('2026-10-08T10:00:00.000Z');
    });

    it('ends two hours before the tee time when that comes first', () => {
        expect(decideBy(at('2026-10-06T10:00:00Z'), at('2026-10-07T16:00:00Z')).toISOString()).toBe('2026-10-07T14:00:00.000Z');
    });
});

describe('freeCancelUntil', () => {
    it('counts back from the tee time', () => {
        expect(freeCancelUntil(at('2026-10-10T00:00:00Z'), 48).toISOString()).toBe('2026-10-08T00:00:00.000Z');
    });
});

describe('isBookableStart', () => {
    const now = at('2026-10-06T00:00:00Z');
    it('needs a day for the team to check, and stays inside the horizon', () => {
        expect(isBookableStart(at('2026-10-06T23:00:00Z'), now)).toBe(false);
        expect(isBookableStart(at('2026-10-07T00:00:00Z'), now)).toBe(true);
        expect(isBookableStart(at('2026-12-10T00:00:00Z'), now)).toBe(false);
    });
});

describe('cancellationFor', () => {
    const cutoff = at('2026-10-08T00:00:00Z');
    const confirmed = { status: 'confirmed' as const, total: 5300, freeCancelUntil: cutoff };

    it('releases a request that was never charged', () => {
        expect(cancellationFor({ ...confirmed, status: 'requested' }, at('2026-10-07T00:00:00Z')))
            .toEqual({ allowed: true, refund: 0, charged: false });
    });

    it('refunds a confirmed booking in full before the cutoff', () => {
        expect(cancellationFor(confirmed, at('2026-10-07T23:59:00Z'))).toEqual({ allowed: true, refund: 5300, charged: true });
    });

    it('refuses once free cancellation has ended', () => {
        expect(cancellationFor(confirmed, cutoff)).toEqual({ allowed: false, reason: 'free_cancellation_ended' });
    });

    it('refuses anything that is not waiting or confirmed', () => {
        for (const status of ['held', 'expired', 'declined', 'cancelled'] as const) {
            expect(cancellationFor({ ...confirmed, status }, at('2026-10-01T00:00:00Z'))).toEqual({ allowed: false, reason: 'not_cancellable' });
        }
    });
});
```

- [ ] **Step 2: Run, expect FAIL** — `npx vitest run src/lib/golf/rules.test.ts`

- [ ] **Step 3: Implement**

```ts file=src/lib/golf/rules.ts
import type { GolfBookingStatus } from '@/lib/schemas/golf';

/**
 * The timing rules of a Golf Booking (CONTEXT.md, "Golf Booking"). Client-safe and pure, so the
 * checkout, the status page and the server all read the same numbers.
 */

/** An unpaid hold keeps its spots this long. */
export const HOLD_MINUTES = 15;
/** The team needs time to check with the course, so tee times sooner than this are not sold. */
export const MIN_LEAD_HOURS = 24;
/** Tee times are generated, and sold, this many course-local days ahead. */
export const HORIZON_DAYS = 60;
/** A request is confirmed or declined within this long … */
export const DECIDE_WITHIN_HOURS = 48;
/** … and never later than this long before the tee time. */
export const DECIDE_BEFORE_START_HOURS = 2;

const HOUR = 3_600_000;

export function holdExpiresAt(now: Date): Date {
    return new Date(now.getTime() + HOLD_MINUTES * 60_000);
}

/** When the team must have confirmed or declined a request; card authorisations last about 7 days. */
export function decideBy(requestedAt: Date, startsAt: Date): Date {
    return new Date(Math.min(
        requestedAt.getTime() + DECIDE_WITHIN_HOURS * HOUR,
        startsAt.getTime() - DECIDE_BEFORE_START_HOURS * HOUR,
    ));
}

export function freeCancelUntil(startsAt: Date, freeCancelHours: number): Date {
    return new Date(startsAt.getTime() - freeCancelHours * HOUR);
}

/** Far enough ahead for the team to check, and inside the horizon (plus a day for zone edges). */
export function isBookableStart(startsAt: Date, now: Date): boolean {
    const lead = startsAt.getTime() - now.getTime();
    return lead >= MIN_LEAD_HOURS * HOUR && lead <= (HORIZON_DAYS + 1) * 24 * HOUR;
}

export type CustomerCancellation =
    | { allowed: false; reason: 'not_cancellable' | 'free_cancellation_ended' }
    | { allowed: true; refund: number; charged: boolean };

/**
 * What a customer's cancellation does at `now`. A request was never charged, so cancelling it
 * releases the authorisation. A confirmed booking is refunded in full, fee included (ADR-0036),
 * until the cutoff recorded on it; after that it is not cancellable online (ADR-0023: refusing
 * is the safe direction) and the customer is pointed to support.
 */
export function cancellationFor(
    booking: { status: GolfBookingStatus; total: number; freeCancelUntil: Date },
    now: Date,
): CustomerCancellation {
    if (booking.status === 'requested') return { allowed: true, refund: 0, charged: false };
    if (booking.status !== 'confirmed') return { allowed: false, reason: 'not_cancellable' };
    if (now.getTime() >= booking.freeCancelUntil.getTime()) return { allowed: false, reason: 'free_cancellation_ended' };
    return { allowed: true, refund: booking.total, charged: true };
}
```

- [ ] **Step 4: Run, expect PASS** — `npx vitest run src/lib/golf/rules.test.ts`

- [ ] **Step 5: Commit** — `git add src/lib/golf/rules.ts src/lib/golf/rules.test.ts && git commit -m "feat(golf): booking timing and cancellation rules"`

---

### Task 6: Golf service fee

**Files:** Modify `src/lib/pricing.ts`, Test `src/lib/pricing-golf.test.ts`

- [ ] **Step 1: Failing test**

```ts file=src/lib/pricing-golf.test.ts
import { describe, it, expect } from 'vitest';
import { applyMarkup, golfServiceFee, GOLF_MARKUP_SPEC } from './pricing';

const same = (amount: number) => amount;

describe('golfServiceFee', () => {
    it.skipIf(process.env.GOLF_MARKUP_PERCENTAGE !== undefined || process.env.GOLF_MARKUP_FLAT_USD !== undefined)(
        'charges the hotel numbers until golf has its own',
        () => {
            expect(GOLF_MARKUP_SPEC).toMatchObject({ rate: 0.059, flat: 0.40 });
        },
    );

    it('applies the golf spec, flat part included', () => {
        const expected = applyMarkup(200, GOLF_MARKUP_SPEC, GOLF_MARKUP_SPEC.flat);
        const fee = golfServiceFee(200, 'USD', same);
        expect(fee.chargedTotal).toBe(expected.chargedPrice);
        expect(fee.serviceFee).toBe(expected.markupAmount);
    });

    it('drops the flat part rather than refuse when it cannot be converted', () => {
        const fee = golfServiceFee(5000, 'PHP', () => { throw new Error('no rate'); });
        expect(fee.markupFlat).toBe(0);
        expect(fee.chargedTotal).toBeGreaterThan(5000);
    });
});
```

- [ ] **Step 2: Run, expect FAIL** — `npx vitest run src/lib/pricing-golf.test.ts` → `golfServiceFee` is not exported.

- [ ] **Step 3: Implement** — in `src/lib/pricing.ts`, directly after the `HOTEL_MARKUP_SPEC` declaration, insert:

```ts
/**
 * Golf: the hotel numbers until golf's own Platform Cost is measured. Golf has no supplier
 * platform fee yet — the course is paid directly — so Stripe is the cost being recovered.
 */
export const GOLF_MARKUP_SPEC: MarkupSpec = {
    rate: parseMarkupEnv('GOLF_MARKUP_PERCENTAGE', 0.059),
    flat: parseFlatEnv('GOLF_MARKUP_FLAT_USD', 0.40),
    cap: parseMarkupEnv('MARKUP_CAP', 0.12),
};
```

Then replace the body of `hotelServiceFee` with a shared helper, and add `golfServiceFee` after it. The whole region from `export function hotelServiceFee(` to its closing `}` becomes:

```ts
export function hotelServiceFee(
    baseInChargeCurrency: number,
    currency: string,
    convert: (amount: number, from: string, to: string) => number,
) {
    return serviceFeeFor(HOTEL_MARKUP_SPEC, baseInChargeCurrency, currency, convert);
}

/** The golf twin of {@link hotelServiceFee}: same shape, golf's own spec. */
export function golfServiceFee(
    baseInChargeCurrency: number,
    currency: string,
    convert: (amount: number, from: string, to: string) => number,
) {
    return serviceFeeFor(GOLF_MARKUP_SPEC, baseInChargeCurrency, currency, convert);
}

function serviceFeeFor(
    spec: MarkupSpec,
    baseInChargeCurrency: number,
    currency: string,
    convert: (amount: number, from: string, to: string) => number,
): {
    serviceFee: number;
    chargedTotal: number;
    markupRate: number;
    markupFlat: number;
    capped: boolean;
} {
    let flat = 0;
    try {
        flat = convert(spec.flat, 'USD', currency);
    } catch {
        flat = 0;
    }
    const pricing = applyMarkup(baseInChargeCurrency, spec, flat);
    return {
        serviceFee: pricing.markupAmount,
        chargedTotal: pricing.chargedPrice,
        markupRate: pricing.markupRate,
        markupFlat: pricing.markupFlat,
        capped: pricing.capped,
    };
}
```

- [ ] **Step 4: Run, expect PASS** — `npx vitest run src/lib/pricing-golf.test.ts src/lib/pricing-markup.test.ts`

- [ ] **Step 5: Commit** — `git add src/lib/pricing.ts src/lib/pricing-golf.test.ts && git commit -m "feat(golf): golf service fee"`

---

### Task 7: Errors, and the course module learns the new columns

**Files:** Modify `src/lib/server/golf/errors.ts` (whole file), `src/lib/server/golf/courses.ts`, `src/lib/server/golf/courses.integration.test.ts`, `src/app/api/admin/golf-courses/route.ts`, `src/app/api/admin/golf-courses/route.test.ts`

- [ ] **Step 1: Failing test** — append to `src/app/api/admin/golf-courses/route.test.ts` inside the `describe`:

```ts
    it('answers deleting a course with bookings with 409', async () => {
        const { deleteCourses } = await import('@/lib/server/golf/courses');
        const { CourseHasBookingsError } = await import('@/lib/server/golf/errors');
        vi.mocked(deleteCourses).mockRejectedValueOnce(new CourseHasBookingsError());
        const res = await post({ action: 'delete', id: crypto.randomUUID() });
        expect(res.status).toBe(409);
    });
```

- [ ] **Step 2: Run, expect FAIL** — `npx vitest run src/app/api/admin/golf-courses/route.test.ts`

- [ ] **Step 3: Errors**

```ts file=src/lib/server/golf/errors.ts
/** Another course already uses this slug. Kept apart from courses.ts so tests can mock that module. */
export class SlugTakenError extends Error {
    constructor(public readonly slug: string) {
        super(`The slug "${slug}" is already used by another course`);
        this.name = 'SlugTakenError';
    }
}

/** A course with tee-time bookings cannot be deleted; unpublishing hides it instead. */
export class CourseHasBookingsError extends Error {
    constructor() {
        super('This course has tee-time bookings, so it cannot be deleted. Unpublish it instead.');
        this.name = 'CourseHasBookingsError';
    }
}

/** Tee times are set on the course's clock, so a course needs a time zone before it gets a schedule. */
export class CourseNotSchedulableError extends Error {
    constructor() {
        super('Set the course time zone before adding tee-time schedules.');
        this.name = 'CourseNotSchedulableError';
    }
}

export type GolfBookingErrorCode =
    | 'tee_time_unavailable' | 'not_enough_spots' | 'payment_unavailable'
    | 'not_found' | 'wrong_status' | 'not_cancellable' | 'free_cancellation_ended';

const HTTP_STATUS: Record<GolfBookingErrorCode, number> = {
    tee_time_unavailable: 409,
    not_enough_spots: 409,
    payment_unavailable: 502,
    not_found: 404,
    wrong_status: 409,
    not_cancellable: 409,
    free_cancellation_ended: 409,
};

/** A booking step refused for a reason the customer or the team can act on. */
export class GolfBookingError extends Error {
    constructor(
        public readonly code: GolfBookingErrorCode,
        message: string,
        public readonly detail: Record<string, unknown> = {},
    ) {
        super(message);
        this.name = 'GolfBookingError';
    }

    get httpStatus(): number {
        return HTTP_STATUS[this.code];
    }
}
```

- [ ] **Step 4: courses.ts** — four edits.

`columns()`: replace `amenities, status` with
```ts
        amenities, status, timezone, free_cancel_hours AS "freeCancelHours"
```

`createCourse`: replace the column list and values with
```ts
            INSERT INTO golf_courses
                (slug, name, country, city, address, description, holes, par,
                 green_fee_from, currency, image_urls, amenities, timezone, free_cancel_hours)
            VALUES
                (${input.slug}, ${input.name}, ${input.country}, ${input.city}, ${input.address},
                 ${input.description}, ${input.holes}, ${input.par}, ${input.greenFeeFrom},
                 ${input.currency}, ${input.imageUrls}::text[], ${input.amenities}::text[],
                 ${input.timezone}, ${input.freeCancelHours})
```

`updateCourse`: replace `amenities = ${input.amenities}::text[], updated_at = now()` with
```ts
                amenities = ${input.amenities}::text[], timezone = ${input.timezone},
                free_cancel_hours = ${input.freeCancelHours}, updated_at = now()
```

`deleteCourses`: replace its body after the empty check with
```ts
    const sql = getSqlAdmin();
    try {
        const rows = await sql`DELETE FROM golf_courses WHERE id IN ${sql(ids)} RETURNING id`;
        return rows.length;
    } catch (err) {
        // golf_bookings restricts deletes: a booking must keep its course.
        if ((err as { code?: string })?.code === '23503') throw new CourseHasBookingsError();
        throw err;
    }
```
and change the errors import to `import { CourseHasBookingsError, SlugTakenError } from './errors';`.

- [ ] **Step 5: Integration fixture** — in `src/lib/server/golf/courses.integration.test.ts`, the object returned by `input()` gains the two fields (postgres.js refuses `undefined`):

```ts
        imageUrls: [], amenities: ['cart'], timezone: null, freeCancelHours: 48, ...over,
```

- [ ] **Step 6: Route** — in `src/app/api/admin/golf-courses/route.ts`, import `CourseHasBookingsError` beside `SlugTakenError` and add to the `catch` before `throw err`:

```ts
        if (err instanceof CourseHasBookingsError) return fail(409, err.message);
```

- [ ] **Step 7: Run, expect PASS** — `npx vitest run src/app/api/admin/golf-courses src/lib/server/golf` (the integration file runs only with `DATABASE_URL`; run it that way too).

- [ ] **Step 8: Commit** — `git add src/lib/server/golf src/app/api/admin/golf-courses && git commit -m "feat(golf): course time zone and free-cancellation hours; guard deleting booked courses"`

---

### Task 8: Tee-time schedules and availability

**Files:** Create `src/lib/server/golf/teeTimes.ts`, Test `src/lib/server/golf/teeTimes.integration.test.ts`

- [ ] **Step 1: Failing test**

```ts file=src/lib/server/golf/teeTimes.integration.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import type { GolfCourseInput, TeeTimeScheduleInput } from '@/lib/schemas/golf';
import { createCourse, setCourseStatus, deleteCourses } from './courses';
import {
    courseHasSchedules, createSchedule, deleteSchedule, generateTeeTimes,
    getBookableTeeTime, listAvailableTeeTimes, listSchedules,
} from './teeTimes';
import { CourseNotSchedulableError } from './errors';

/**
 * Tee times against a real database: generation, the 24-hour lead and "published only" are
 * all SQL. Skips when no database is reachable. Uses dates in 2030 so nothing real collides.
 */

async function databaseReachable(): Promise<boolean> {
    if (!process.env.DATABASE_URL) return false;
    try {
        const { getSqlAdmin } = await import('@/lib/db/postgres');
        await getSqlAdmin()`SELECT 1 FROM golf_tee_times LIMIT 1`;
        return true;
    } catch {
        return false;
    }
}

const reachable = await databaseReachable();
const run = crypto.randomUUID().slice(0, 8);
const created: string[] = [];
/** 08:00 on Sunday 6 January 2030 in Manila. */
const NOW = new Date('2030-01-06T00:00:00Z');

function course(over: Partial<GolfCourseInput> = {}): GolfCourseInput {
    return {
        name: `Tee Time Test ${run}`, country: 'Philippines', city: 'Manila',
        slug: `tee-time-test-${run}-${created.length}`, address: null, description: '', holes: 18,
        par: null, greenFeeFrom: null, currency: 'PHP', imageUrls: [], amenities: [],
        timezone: 'Asia/Manila', freeCancelHours: 48, ...over,
    };
}

const daily: TeeTimeScheduleInput = {
    name: 'Daily early', daysOfWeek: [0, 1, 2, 3, 4, 5, 6], firstTee: '07:00', lastTee: '07:30',
    intervalMinutes: 10, spots: 4, pricePerPlayer: 2500,
};

async function make(over: Partial<GolfCourseInput> = {}) {
    const c = await createCourse(course(over));
    created.push(c.id);
    return c;
}

afterAll(async () => {
    if (created.length) await deleteCourses(created);
});

describe.skipIf(!reachable)('tee times against a real database', () => {
    it('refuses a schedule until the course has a time zone', async () => {
        const c = await make({ timezone: null });
        await expect(createSchedule(c.id, daily, NOW)).rejects.toBeInstanceOf(CourseNotSchedulableError);
    });

    it('generates the horizon once, skipping tee times already past', async () => {
        const c = await make();
        const result = await createSchedule(c.id, daily, NOW);
        // Four a day for 60 days, less today's four: 07:00–07:30 in Manila is before 08:00.
        expect(result?.generated).toBe(236);
        expect(await generateTeeTimes({ courseId: c.id, now: NOW })).toBe(0);
        expect(await listSchedules(c.id)).toEqual([expect.objectContaining({ name: 'Daily early', firstTee: '07:00', daysOfWeek: [0, 1, 2, 3, 4, 5, 6] })]);
        expect(await courseHasSchedules(c.id)).toBe(true);
    });

    it('sells only published courses, and nothing inside the 24-hour lead', async () => {
        const c = await make();
        await createSchedule(c.id, daily, NOW);
        expect(await listAvailableTeeTimes(c.slug, '2030-01-08', NOW)).toBeNull();

        await setCourseStatus(c.id, 'published');
        // 7 January 07:00–07:30 in Manila is 6 January 23:00–23:30 UTC: under 24 hours away.
        expect((await listAvailableTeeTimes(c.slug, '2030-01-07', NOW))?.teeTimes).toEqual([]);

        const day = await listAvailableTeeTimes(c.slug, '2030-01-08', NOW);
        expect(day?.teeTimes.map(t => t.localTime)).toEqual(['07:00', '07:10', '07:20', '07:30']);
        expect(day?.teeTimes[0]).toMatchObject({ spots: 4, spotsLeft: 4, pricePerPlayer: 2500, currency: 'PHP' });

        const bookable = await getBookableTeeTime(day!.teeTimes[0].id, NOW);
        expect(bookable?.course).toMatchObject({ slug: c.slug, timezone: 'Asia/Manila', freeCancelHours: 48 });
        expect(await getBookableTeeTime('not-a-uuid', NOW)).toBeNull();
    });

    it('takes a deleted schedule\'s unbooked tee times with it', async () => {
        const c = await make();
        const result = await createSchedule(c.id, daily, NOW);
        expect(await deleteSchedule(result!.schedule.id, NOW)).toBe(true);
        await setCourseStatus(c.id, 'published');
        expect((await listAvailableTeeTimes(c.slug, '2030-01-08', NOW))?.teeTimes).toEqual([]);
        expect(await listSchedules(c.id)).toEqual([]);
        expect(await courseHasSchedules(c.id)).toBe(false);
    });
});
```

- [ ] **Step 2: Run, expect FAIL** — `DATABASE_URL=… npx vitest run src/lib/server/golf/teeTimes.integration.test.ts` → cannot resolve `./teeTimes`.

- [ ] **Step 3: Implement**

```ts file=src/lib/server/golf/teeTimes.ts
import type postgres from 'postgres';
import { getSqlAdmin } from '@/lib/db/postgres';
import type { TeeTime, TeeTimeSchedule, TeeTimeScheduleInput } from '@/lib/schemas/golf';
import { expandSchedule } from '@/lib/golf/schedule';
import { addDays, localDate, localTime, zonedTimeToUtc } from '@/lib/golf/time';
import { HORIZON_DAYS, MIN_LEAD_HOURS, isBookableStart } from '@/lib/golf/rules';
import { CourseNotSchedulableError } from './errors';

/**
 * Tee-time schedules and the tee times they generate (CONTEXT.md, "Tee Time"). A tee time is a
 * row with a capacity; selling it is the conditional decrement in bookings.ts.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HOUR = 3_600_000;

interface TeeTimeRow {
    id: string;
    startsAt: Date;
    spots: number;
    spotsLeft: number;
    pricePerPlayer: number;
    currency: string;
}

function toTeeTime(row: TeeTimeRow, tz: string): TeeTime {
    return {
        id: row.id,
        startsAt: row.startsAt.toISOString(),
        localTime: localTime(row.startsAt, tz),
        spots: row.spots,
        spotsLeft: row.spotsLeft,
        pricePerPlayer: row.pricePerPlayer,
        currency: row.currency.trim(),
    };
}

function scheduleColumns(sql: postgres.Sql) {
    return sql`
        s.id, s.course_id AS "courseId", s.name, s.days_of_week AS "daysOfWeek",
        to_char(s.first_tee, 'HH24:MI') AS "firstTee", to_char(s.last_tee, 'HH24:MI') AS "lastTee",
        s.interval_minutes AS "intervalMinutes", s.spots, s.price_per_player::float8 AS "pricePerPlayer"`;
}

/** postgres.js returns a RowList; plain objects cross the server/client boundary cleanly. */
const plainSchedule = (s: TeeTimeSchedule): TeeTimeSchedule => ({ ...s, daysOfWeek: [...s.daysOfWeek] });

export async function listSchedules(courseId: string): Promise<TeeTimeSchedule[]> {
    const sql = getSqlAdmin();
    const rows = await sql<TeeTimeSchedule[]>`
        SELECT ${scheduleColumns(sql)} FROM golf_tee_time_schedules s
         WHERE s.course_id = ${courseId}
         ORDER BY s.first_tee, s.name`;
    return rows.map(plainSchedule);
}

export async function courseHasSchedules(courseId: string): Promise<boolean> {
    const sql = getSqlAdmin();
    const [row] = await sql<{ has: boolean }[]>`
        SELECT EXISTS (SELECT 1 FROM golf_tee_time_schedules WHERE course_id = ${courseId}) AS has`;
    return row.has;
}

/**
 * Adds a schedule and generates its tee times. null when the course does not exist; throws
 * CourseNotSchedulableError while the course has no time zone.
 */
export async function createSchedule(
    courseId: string,
    input: TeeTimeScheduleInput,
    now = new Date(),
): Promise<{ schedule: TeeTimeSchedule; generated: number } | null> {
    const sql = getSqlAdmin();
    const [course] = await sql<{ timezone: string | null }[]>`SELECT timezone FROM golf_courses WHERE id = ${courseId}`;
    if (!course) return null;
    if (!course.timezone) throw new CourseNotSchedulableError();

    const [{ id }] = await sql<{ id: string }[]>`
        INSERT INTO golf_tee_time_schedules
            (course_id, name, days_of_week, first_tee, last_tee, interval_minutes, spots, price_per_player)
        VALUES
            (${courseId}, ${input.name}, ${input.daysOfWeek}::smallint[], ${input.firstTee}::time,
             ${input.lastTee}::time, ${input.intervalMinutes}, ${input.spots}, ${input.pricePerPlayer})
        RETURNING id`;
    const generated = await generateTeeTimes({ courseId, now });
    const [schedule] = await sql<TeeTimeSchedule[]>`
        SELECT ${scheduleColumns(sql)} FROM golf_tee_time_schedules s WHERE s.id = ${id}`;
    return { schedule: plainSchedule(schedule), generated };
}

/**
 * Deletes a schedule. Its future tee times nobody has booked go with it; any a booking points at
 * stay, closed, so that booking keeps its tee time. false when there was no such schedule.
 */
export async function deleteSchedule(id: string, now = new Date()): Promise<boolean> {
    const sql = getSqlAdmin();
    return sql.begin(async tx => {
        await tx`
            DELETE FROM golf_tee_times t
             WHERE t.schedule_id = ${id} AND t.starts_at > ${now}
               AND NOT EXISTS (SELECT 1 FROM golf_bookings b WHERE b.tee_time_id = t.id)`;
        await tx`UPDATE golf_tee_times SET status = 'closed' WHERE schedule_id = ${id} AND starts_at > ${now}`;
        const rows = await tx`DELETE FROM golf_tee_time_schedules WHERE id = ${id} RETURNING id`;
        return rows.length > 0;
    });
}

/**
 * Creates the tee times every schedule promises for the next HORIZON_DAYS course-local days.
 * Idempotent: a tee time that already exists at the same course and start is left alone, so a
 * re-run never resets spots already sold. Returns how many were created.
 */
export async function generateTeeTimes({ courseId, now = new Date() }: { courseId?: string; now?: Date } = {}): Promise<number> {
    const sql = getSqlAdmin();
    const schedules = await sql<(TeeTimeSchedule & { timezone: string; currency: string })[]>`
        SELECT ${scheduleColumns(sql)}, c.timezone, c.currency
          FROM golf_tee_time_schedules s
          JOIN golf_courses c ON c.id = s.course_id
         WHERE c.timezone IS NOT NULL ${courseId ? sql`AND s.course_id = ${courseId}` : sql``}`;

    let created = 0;
    for (const s of schedules) {
        const starts = expandSchedule(s, s.timezone, localDate(now, s.timezone), HORIZON_DAYS)
            .filter(start => start.getTime() > now.getTime());
        const rows = starts.map(start => ({
            course_id: s.courseId,
            schedule_id: s.id,
            starts_at: start,
            spots: s.spots,
            spots_left: s.spots,
            price_per_player: s.pricePerPlayer,
            currency: s.currency.trim(),
        }));
        for (let i = 0; i < rows.length; i += 1000) {
            const result = await sql`
                INSERT INTO golf_tee_times ${sql(rows.slice(i, i + 1000))}
                ON CONFLICT (course_id, starts_at) DO NOTHING`;
            created += result.count;
        }
    }
    return created;
}

export interface CourseAvailability {
    timezone: string;
    teeTimes: TeeTime[];
}

/**
 * Open tee times with a spot left on one course-local `date`, from MIN_LEAD_HOURS ahead. null
 * when the course is unknown, a draft, or has no time zone.
 */
export async function listAvailableTeeTimes(slug: string, date: string, now = new Date()): Promise<CourseAvailability | null> {
    const sql = getSqlAdmin();
    const [course] = await sql<{ id: string; timezone: string | null }[]>`
        SELECT id, timezone FROM golf_courses WHERE slug = ${slug} AND status = 'published'`;
    if (!course?.timezone) return null;
    const tz = course.timezone;

    const dayStart = zonedTimeToUtc(date, '00:00', tz);
    const dayEnd = zonedTimeToUtc(addDays(date, 1), '00:00', tz);
    const earliest = new Date(Math.max(dayStart.getTime(), now.getTime() + MIN_LEAD_HOURS * HOUR));

    const rows = await sql<TeeTimeRow[]>`
        SELECT id, starts_at AS "startsAt", spots, spots_left AS "spotsLeft",
               price_per_player::float8 AS "pricePerPlayer", currency
          FROM golf_tee_times
         WHERE course_id = ${course.id} AND status = 'open' AND spots_left > 0
           AND starts_at >= ${earliest} AND starts_at < ${dayEnd}
         ORDER BY starts_at`;
    return { timezone: tz, teeTimes: rows.map(r => toTeeTime(r, tz)) };
}

export interface BookableTeeTime {
    teeTime: TeeTime;
    course: {
        id: string;
        slug: string;
        name: string;
        city: string;
        country: string;
        timezone: string;
        freeCancelHours: number;
        coverUrl: string | null;
    };
}

type BookableRow = TeeTimeRow & {
    courseId: string; slug: string; name: string; city: string; country: string;
    timezone: string; freeCancelHours: number; coverUrl: string | null;
};

/** A tee time a customer may book at `now`, with its course; null for anything else. */
export async function getBookableTeeTime(id: string, now = new Date()): Promise<BookableTeeTime | null> {
    if (!UUID.test(id)) return null;
    const sql = getSqlAdmin();
    const [row] = await sql<BookableRow[]>`
        SELECT t.id, t.starts_at AS "startsAt", t.spots, t.spots_left AS "spotsLeft",
               t.price_per_player::float8 AS "pricePerPlayer", t.currency,
               c.id AS "courseId", c.slug, c.name, c.city, c.country, c.timezone,
               c.free_cancel_hours AS "freeCancelHours", c.image_urls[1] AS "coverUrl"
          FROM golf_tee_times t
          JOIN golf_courses c ON c.id = t.course_id
         WHERE t.id = ${id} AND t.status = 'open' AND c.status = 'published' AND c.timezone IS NOT NULL`;
    if (!row || !isBookableStart(row.startsAt, now)) return null;
    return {
        teeTime: toTeeTime(row, row.timezone),
        course: {
            id: row.courseId, slug: row.slug, name: row.name, city: row.city, country: row.country,
            timezone: row.timezone, freeCancelHours: row.freeCancelHours, coverUrl: row.coverUrl,
        },
    };
}
```

- [ ] **Step 4: Run, expect PASS** — `DATABASE_URL=… npx vitest run src/lib/server/golf/teeTimes.integration.test.ts`

- [ ] **Step 5: Commit** — `git add src/lib/server/golf/teeTimes.ts src/lib/server/golf/teeTimes.integration.test.ts && git commit -m "feat(golf): tee-time schedules, generation and availability"`

---

### Task 9: Booking emails

**Files:** Modify `src/lib/server/email.ts`, Create `src/lib/server/golf/emails.ts`, Test `src/lib/server/golf/emails.test.ts`

- [ ] **Step 1: email.ts** — extend the type and export the logger:

```ts
export type EmailType = 'confirmation' | 'ticketed' | 'refund' | 'cancellation' | 'awaiting_ticket' | 'price_alert'
    | 'golf_requested' | 'golf_confirmed' | 'golf_declined' | 'golf_cancelled';
```
and change `async function logEmail(params: {` to `export async function logEmail(params: {`.

- [ ] **Step 2: Failing test**

```ts file=src/lib/server/golf/emails.test.ts
import { describe, it, expect, vi } from 'vitest';
import type { GolfBooking } from '@/lib/schemas/golf';

vi.mock('@/lib/server/email', () => ({
    FROM_NOREPLY: 'CheapestGo <no-reply@example.com>',
    logEmail: vi.fn(async () => ({ duplicate: false })),
}));
vi.mock('@/utils/env', () => ({ env: { RESEND_API_KEY: '' } }));

import { buildGolfBookingEmail, sendGolfBookingEmail } from './emails';
import { logEmail } from '@/lib/server/email';

const booking: GolfBooking = {
    id: 'b1', reference: 'CG-ABC234', userId: 'u1', courseId: 'c1', courseName: 'Wack <Wack>',
    courseSlug: 'wack-wack', timezone: 'Asia/Manila', teeTimeId: 't1', startsAt: '2026-10-09T23:38:00.000Z',
    players: 2, leadName: 'Ana & Co', contactEmail: 'ana@example.com', pricePerPlayer: 2500,
    greenFeeTotal: 5000, serviceFee: 318, total: 5318, currency: 'PHP', paymentIntentId: 'pi_1',
    status: 'requested', holdExpiresAt: '2026-10-06T10:15:00.000Z', requestedAt: '2026-10-06T10:05:00.000Z',
    decideBy: '2026-10-08T10:05:00.000Z', confirmedAt: null, closedAt: null, closeReason: null,
    refundAmount: 0, freeCancelUntil: '2026-10-07T23:38:00.000Z',
};

describe('buildGolfBookingEmail', () => {
    it('says a request is not charged yet, on the course clock, with everything escaped', () => {
        const { subject, html } = buildGolfBookingEmail('requested', booking);
        expect(subject).toBe('Tee time requested – Wack <Wack>');
        expect(html).toContain('Wack &lt;Wack&gt;');
        expect(html).toContain('Ana &amp; Co');
        expect(html).toContain('won&#39;t be charged');
        expect(html).toContain('10 Oct 2026');
        expect(html).toContain('07:38');
        expect(html).toContain('5,318.00');
        expect(html).toContain('/golf/bookings/CG-ABC234');
    });

    it('explains a decline that ran out of time', () => {
        const { html } = buildGolfBookingEmail('declined', { ...booking, status: 'declined', closeReason: 'not_confirmed_in_time' });
        expect(html).toContain('in time');
        expect(html).toContain('not charged');
    });

    it('states the refund on a cancellation, or that nothing was charged', () => {
        const refunded = buildGolfBookingEmail('cancelled', { ...booking, status: 'cancelled', refundAmount: 5318, closeReason: 'cancelled_by_customer' });
        expect(refunded.html).toContain('refunded');
        const free = buildGolfBookingEmail('cancelled', { ...booking, status: 'cancelled', refundAmount: 0, closeReason: 'cancelled_by_customer' });
        expect(free.html).toContain('You were not charged.');
    });
});

describe('sendGolfBookingEmail', () => {
    it('queues the email in email_logs when no provider key is set', async () => {
        await sendGolfBookingEmail('confirmed', { ...booking, status: 'confirmed' });
        expect(logEmail).toHaveBeenCalledWith(expect.objectContaining({
            bookingId: 'CG-ABC234', recipient: 'ana@example.com', emailType: 'golf_confirmed', status: 'queued',
        }));
    });
});
```

- [ ] **Step 3: Run, expect FAIL** — `npx vitest run src/lib/server/golf/emails.test.ts`

- [ ] **Step 4: Implement**

```ts file=src/lib/server/golf/emails.ts
import { env } from '@/utils/env';
import { FROM_NOREPLY, logEmail } from '@/lib/server/email';
import type { GolfBooking } from '@/lib/schemas/golf';

/**
 * Golf Booking emails, one for each status a customer has to hear about. English, like the
 * other booking emails. Never throws: a failed send is recorded in email_logs and the booking
 * carries on.
 */

export type GolfEmailKind = 'requested' | 'confirmed' | 'declined' | 'cancelled';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://cheapestgo.com').replace(/\/$/, '');

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ENTITIES[c]);

function money(amount: number, currency: string): string {
    try {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
    } catch {
        return `${currency} ${amount.toFixed(2)}`;
    }
}

/** "Sat 10 Oct 2026, 07:38" on the course's clock. */
function when(iso: string, tz: string | null): string {
    return new Intl.DateTimeFormat('en-GB', {
        timeZone: tz ?? 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).format(new Date(iso));
}

function wording(kind: GolfEmailKind, b: GolfBooking): { subject: string; lead: string; note: string } {
    const course = b.courseName;
    switch (kind) {
        case 'requested':
            return {
                subject: `Tee time requested – ${course}`,
                lead: `We've asked ${course} to confirm your tee time.`,
                note: `Your card has been authorised for ${money(b.total, b.currency)} but won't be charged until the course confirms. We'll email you by ${when(b.decideBy ?? b.startsAt, b.timezone)}.`,
            };
        case 'confirmed':
            return {
                subject: `Tee time confirmed – ${course}`,
                lead: `${course} has confirmed your tee time.`,
                note: `We've charged ${money(b.total, b.currency)}. Free cancellation until ${when(b.freeCancelUntil, b.timezone)}.`,
            };
        case 'declined':
            return {
                subject: `We couldn't confirm your tee time – ${course}`,
                lead: b.closeReason === 'not_confirmed_in_time'
                    ? `We couldn't get confirmation from ${course} in time.`
                    : `${course} couldn't take this booking.`,
                note: 'Your card was not charged, and the amount we reserved has been released.',
            };
        case 'cancelled':
            return {
                subject: `Tee time cancelled – ${course}`,
                lead: b.closeReason === 'cancelled_by_team'
                    ? `${course} had to cancel this tee time.`
                    : 'Your tee time has been cancelled.',
                note: b.refundAmount > 0
                    ? `We've refunded ${money(b.refundAmount, b.currency)}. It can take 5–10 business days to appear on your statement.`
                    : 'You were not charged.',
            };
    }
}

export function buildGolfBookingEmail(kind: GolfEmailKind, b: GolfBooking): { subject: string; html: string } {
    const { subject, lead, note } = wording(kind, b);
    const rows: [string, string][] = [
        ['Reference', b.reference],
        ['Course', b.courseName],
        ['Tee time', `${when(b.startsAt, b.timezone)} (course time)`],
        ['Players', String(b.players)],
        ['Lead player', b.leadName],
        ['Green fee', money(b.greenFeeTotal, b.currency)],
        ['Service fee', money(b.serviceFee, b.currency)],
        ['Total', money(b.total, b.currency)],
    ];
    const link = `${SITE_URL}/golf/bookings/${encodeURIComponent(b.reference)}`;
    const html = `<!doctype html>
<html><body style="margin:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px">
<tr><td style="padding:28px 28px 8px">
<h1 style="margin:0 0 12px;font-size:20px">${escapeHtml(subject)}</h1>
<p style="margin:0 0 8px;font-size:15px;line-height:1.5">${escapeHtml(lead)}</p>
<p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:#475569">${escapeHtml(note)}</p>
</td></tr>
<tr><td style="padding:0 28px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">
${rows.map(([k, v]) => `<tr><td style="padding:6px 0;color:#64748b">${escapeHtml(k)}</td><td style="padding:6px 0;text-align:right">${escapeHtml(v)}</td></tr>`).join('\n')}
</table></td></tr>
<tr><td style="padding:24px 28px 28px"><a href="${link}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold">View your booking</a></td></tr>
</table></td></tr></table>
</body></html>`;
    return { subject, html };
}

export async function sendGolfBookingEmail(kind: GolfEmailKind, b: GolfBooking): Promise<void> {
    const emailType = `golf_${kind}` as const;
    try {
        const { subject, html } = buildGolfBookingEmail(kind, b);
        const base = { bookingId: b.reference, recipient: b.contactEmail, subject, emailType };
        const key = env.RESEND_API_KEY;
        if (!key) {
            await logEmail({ ...base, status: 'queued', htmlBody: html });
            return;
        }
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: FROM_NOREPLY, to: [b.contactEmail], subject, html }),
        });
        if (response.ok) {
            await logEmail({ ...base, status: 'sent' });
        } else {
            await logEmail({ ...base, status: 'failed', errorMessage: await response.text(), htmlBody: html });
        }
    } catch (err) {
        console.error(`[golf] ${emailType} email for ${b.reference} failed:`, err);
    }
}
```

- [ ] **Step 5: Run, expect PASS** — `npx vitest run src/lib/server/golf/emails.test.ts`

- [ ] **Step 6: Commit** — `git add src/lib/server/email.ts src/lib/server/golf/emails.ts src/lib/server/golf/emails.test.ts && git commit -m "feat(golf): booking status emails"`

---

### Task 10: Booking lifecycle

**Files:** Create `src/lib/server/golf/bookings.ts`, Test `src/lib/server/golf/bookings.integration.test.ts`

- [ ] **Step 1: Failing test** (Stripe and email are mocked; the database is real)

```ts file=src/lib/server/golf/bookings.integration.test.ts
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

/**
 * Golf Bookings against a real database, with Stripe and email mocked: the oversell guard, the
 * live-hold rule and every status transition are SQL. Skips when no database is reachable.
 * Uses dates in 2031 so nothing real collides.
 */

const stripeState = vi.hoisted(() => ({
    intents: new Map<string, { id: string; status: string; client_secret: string; amount: number }>(),
    count: 0,
}));

vi.mock('@/lib/stripe/server', () => ({
    stripe: {
        paymentIntents: {
            create: vi.fn(async (params: { amount: number }) => {
                const id = `pi_golftest_${Date.now()}_${++stripeState.count}`;
                const intent = { id, status: 'requires_payment_method', client_secret: `${id}_secret`, amount: params.amount };
                stripeState.intents.set(id, intent);
                return intent;
            }),
            retrieve: vi.fn(async (id: string) => stripeState.intents.get(id)),
            capture: vi.fn(async (id: string) => Object.assign(stripeState.intents.get(id)!, { status: 'succeeded' })),
            cancel: vi.fn(async (id: string) => Object.assign(stripeState.intents.get(id)!, { status: 'canceled' })),
        },
        refunds: { create: vi.fn(async () => ({ id: 're_golftest' })) },
    },
}));
vi.mock('./emails', () => ({ sendGolfBookingEmail: vi.fn(async () => undefined) }));

import { stripe } from '@/lib/stripe/server';
import { toStripeAmount } from '@/lib/pricing';
import { addDays } from '@/lib/golf/time';
import type { GolfCourseInput } from '@/lib/schemas/golf';
import { createCourse, deleteCourses, setCourseStatus } from './courses';
import { createSchedule, listAvailableTeeTimes } from './teeTimes';
import {
    cancelByCustomer, confirmBooking, declineBooking, getBookingById, holdTeeTime, sweepGolfBookings, syncPayment,
} from './bookings';
import { GolfBookingError } from './errors';

async function databaseReachable(): Promise<boolean> {
    if (!process.env.DATABASE_URL) return false;
    try {
        const { getSqlAdmin } = await import('@/lib/db/postgres');
        await getSqlAdmin()`SELECT 1 FROM golf_bookings LIMIT 1`;
        return true;
    } catch {
        return false;
    }
}

const reachable = await databaseReachable();
const run = crypto.randomUUID().slice(0, 8);
/** 08:00 on Monday 3 March 2031 in Manila. */
const NOW = new Date('2031-03-03T00:00:00Z');
const MINUTE = 60_000;
const later = (minutes: number) => new Date(NOW.getTime() + minutes * MINUTE);

let courseId = '';
let slug = '';
const users: string[] = [];

async function sql() {
    const { getSqlAdmin } = await import('@/lib/db/postgres');
    return getSqlAdmin();
}

beforeAll(async () => {
    if (!reachable) return;
    const input: GolfCourseInput = {
        name: `Booking Test ${run}`, country: 'Philippines', city: 'Manila', slug: `booking-test-${run}`,
        address: null, description: '', holes: 18, par: null, greenFeeFrom: null, currency: 'USD',
        imageUrls: [], amenities: [], timezone: 'Asia/Manila', freeCancelHours: 48,
    };
    const course = await createCourse(input);
    courseId = course.id;
    slug = course.slug;
    await setCourseStatus(courseId, 'published');
    // One 08:00 tee time a day with two spots.
    await createSchedule(courseId, {
        name: 'Daily 08:00', daysOfWeek: [0, 1, 2, 3, 4, 5, 6], firstTee: '08:00', lastTee: '08:00',
        intervalMinutes: 10, spots: 2, pricePerPlayer: 100,
    }, NOW);
    const db = await sql();
    for (const n of [0, 1]) {
        const [row] = await db<{ id: string }[]>`INSERT INTO users (email) VALUES (${`golf-${run}-${n}@example.com`}) RETURNING id`;
        users.push(row.id);
    }
});

afterAll(async () => {
    if (!reachable) return;
    const db = await sql();
    await db`DELETE FROM golf_bookings WHERE course_id = ${courseId}`;
    await deleteCourses([courseId]);
    if (users.length) await db`DELETE FROM users WHERE id IN ${db(users)}`;
});

/** The 08:00 tee time `days` course-local days after NOW. */
async function teeTime(days: number): Promise<string> {
    const day = await listAvailableTeeTimes(slug, addDays('2031-03-03', days), NOW);
    return day!.teeTimes[0].id;
}

async function spotsLeft(teeTimeId: string): Promise<number> {
    const db = await sql();
    const [row] = await db<{ spotsLeft: number }[]>`SELECT spots_left AS "spotsLeft" FROM golf_tee_times WHERE id = ${teeTimeId}`;
    return row.spotsLeft;
}

const hold = (user: number, teeTimeId: string, players = 1, now = NOW) =>
    holdTeeTime({ userId: users[user], email: `golf-${run}-${user}@example.com`, teeTimeId, players, leadName: 'Test Player' }, now);

/** What Stripe does when the customer's card is authorised. */
const authorise = (paymentIntentId: string | null) => {
    stripeState.intents.get(paymentIntentId!)!.status = 'requires_capture';
};

async function requested(user: number, teeTimeId: string, players = 1) {
    const { booking } = await hold(user, teeTimeId, players);
    authorise(booking.paymentIntentId);
    return (await syncPayment(booking.id, later(5)))!;
}

describe.skipIf(!reachable)('golf bookings against a real database', () => {
    it('lets exactly one of two customers take the last spots', async () => {
        const id = await teeTime(2);
        const results = await Promise.allSettled([hold(0, id, 2), hold(1, id, 2)]);
        expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
        const loser = results.find(r => r.status === 'rejected') as PromiseRejectedResult;
        expect(loser.reason).toBeInstanceOf(GolfBookingError);
        expect(loser.reason.code).toBe('not_enough_spots');
        expect(await spotsLeft(id)).toBe(0);
    });

    it('answers a repeated request with the hold the customer already has', async () => {
        const id = await teeTime(3);
        const first = await hold(0, id);
        const second = await hold(0, id);
        expect(second.booking.reference).toBe(first.booking.reference);
        expect(second.clientSecret).toBe(first.clientSecret);
        expect(await spotsLeft(id)).toBe(1);
    });

    it('ends a customer\'s hold on another tee time when they start a new one', async () => {
        const a = await teeTime(4);
        const b = await teeTime(5);
        const first = await hold(0, a);
        await hold(0, b);
        expect((await getBookingById(first.booking.id))?.status).toBe('expired');
        expect(await spotsLeft(a)).toBe(2);
    });

    it('moves held → requested → confirmed, capturing only at confirmation', async () => {
        const id = await teeTime(6);
        const booking = await requested(0, id, 2);
        expect(booking.status).toBe('requested');
        expect(booking.decideBy).toBe(new Date(later(5).getTime() + 48 * 60 * MINUTE).toISOString());
        expect(stripe.paymentIntents.capture).not.toHaveBeenCalledWith(booking.paymentIntentId, expect.anything(), expect.anything());

        const confirmed = await confirmBooking(booking.id, later(60));
        expect(confirmed.status).toBe('confirmed');
        expect(stripe.paymentIntents.capture).toHaveBeenCalledWith(booking.paymentIntentId, {}, { idempotencyKey: `golf-capture-${booking.id}` });
        expect(await spotsLeft(id)).toBe(0);
    });

    it('sweeps an unpaid hold, freeing its spots and its PaymentIntent', async () => {
        const id = await teeTime(7);
        const { booking } = await hold(0, id, 2);
        const result = await sweepGolfBookings(later(16));
        expect(result.expired).toBeGreaterThanOrEqual(1);
        const swept = await getBookingById(booking.id);
        expect(swept).toMatchObject({ status: 'expired', closeReason: 'hold_expired' });
        expect(await spotsLeft(id)).toBe(2);
        expect(stripe.paymentIntents.cancel).toHaveBeenCalledWith(booking.paymentIntentId);
    });

    it('sweeps a hold whose payment went through into a request instead', async () => {
        const id = await teeTime(8);
        const { booking } = await hold(0, id);
        authorise(booking.paymentIntentId);
        await sweepGolfBookings(later(16));
        expect((await getBookingById(booking.id))?.status).toBe('requested');
    });

    it('declines a request nobody decided by its deadline, without charging', async () => {
        const id = await teeTime(9);
        const booking = await requested(0, id, 2);
        await sweepGolfBookings(new Date(new Date(booking.decideBy!).getTime() + MINUTE));
        expect(await getBookingById(booking.id)).toMatchObject({ status: 'declined', closeReason: 'not_confirmed_in_time', refundAmount: 0 });
        expect(await spotsLeft(id)).toBe(2);
    });

    it('lets the team decline a request, releasing spots and the authorisation', async () => {
        const id = await teeTime(10);
        const booking = await requested(0, id, 2);
        const declined = await declineBooking(booking.id);
        expect(declined).toMatchObject({ status: 'declined', closeReason: 'declined_by_team' });
        expect(await spotsLeft(id)).toBe(2);
        expect(stripe.paymentIntents.cancel).toHaveBeenCalledWith(booking.paymentIntentId);
    });

    it('refunds a confirmed booking in full when the customer cancels before the cutoff', async () => {
        const id = await teeTime(11);
        const booking = await requested(0, id);
        await confirmBooking(booking.id, later(60));
        const cancelled = await cancelByCustomer(booking.reference, users[0], later(120));
        expect(cancelled).toMatchObject({ status: 'cancelled', closeReason: 'cancelled_by_customer', refundAmount: booking.total });
        expect(stripe.refunds.create).toHaveBeenCalledWith(
            { payment_intent: booking.paymentIntentId, amount: toStripeAmount(booking.total, 'USD') },
            { idempotencyKey: `golf-refund-${booking.id}` },
        );
        expect(await spotsLeft(id)).toBe(2);
    });

    it('refuses an online cancellation once free cancellation has ended, and a stranger\'s', async () => {
        const id = await teeTime(12);
        const booking = await requested(0, id);
        await confirmBooking(booking.id, later(60));
        await expect(cancelByCustomer(booking.reference, users[1], later(120))).rejects.toMatchObject({ code: 'not_found' });
        await expect(cancelByCustomer(booking.reference, users[0], new Date(booking.freeCancelUntil)))
            .rejects.toMatchObject({ code: 'free_cancellation_ended' });
    });
});
```

- [ ] **Step 2: Run, expect FAIL** — `DATABASE_URL=… npx vitest run src/lib/server/golf/bookings.integration.test.ts` → cannot resolve `./bookings`.

- [ ] **Step 3: Implement**

```ts file=src/lib/server/golf/bookings.ts
import type postgres from 'postgres';
import { getSqlAdmin } from '@/lib/db/postgres';
import { stripe } from '@/lib/stripe/server';
import { golfServiceFee, toStripeAmount } from '@/lib/pricing';
import { convertCurrencyStrict, refreshExchangeRates } from '@/lib/currency';
import { mintUniqueBookingReference } from '@/lib/bookingReference';
import { canonicalBrandName } from '@/lib/brand';
import { cancellationFor, decideBy, freeCancelUntil, holdExpiresAt } from '@/lib/golf/rules';
import type { GolfBooking, GolfBookingStatus, GolfCloseReason } from '@/lib/schemas/golf';
import { getBookableTeeTime } from './teeTimes';
import { GolfBookingError } from './errors';
import { sendGolfBookingEmail } from './emails';

/**
 * Golf Bookings (CONTEXT.md, "Golf Booking"): held → requested → confirmed, or expired,
 * declined, cancelled. Our tee times are not the course's own tee sheet, so checkout only
 * authorises the card; the team captures it after confirming with the course.
 *
 * Spots move only in the transactions in this file, together with the status that explains them.
 */

type DateKey = 'startsAt' | 'holdExpiresAt' | 'requestedAt' | 'decideBy' | 'confirmedAt' | 'closedAt' | 'freeCancelUntil';
type BookingRow = Omit<GolfBooking, DateKey> & {
    startsAt: Date;
    holdExpiresAt: Date;
    requestedAt: Date | null;
    decideBy: Date | null;
    confirmedAt: Date | null;
    closedAt: Date | null;
    freeCancelUntil: Date;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const iso = (d: Date | null) => (d ? d.toISOString() : null);

function toBooking(r: BookingRow): GolfBooking {
    return {
        ...r,
        currency: r.currency.trim(),
        startsAt: r.startsAt.toISOString(),
        holdExpiresAt: r.holdExpiresAt.toISOString(),
        requestedAt: iso(r.requestedAt),
        decideBy: iso(r.decideBy),
        confirmedAt: iso(r.confirmedAt),
        closedAt: iso(r.closedAt),
        freeCancelUntil: r.freeCancelUntil.toISOString(),
    };
}

function selectBookings(sql: postgres.Sql) {
    return sql`
        SELECT b.id, b.reference, b.user_id AS "userId", b.course_id AS "courseId",
               c.name AS "courseName", c.slug AS "courseSlug", c.timezone,
               b.tee_time_id AS "teeTimeId", t.starts_at AS "startsAt", b.players,
               b.lead_name AS "leadName", b.contact_email AS "contactEmail",
               b.price_per_player::float8 AS "pricePerPlayer", b.green_fee_total::float8 AS "greenFeeTotal",
               b.service_fee::float8 AS "serviceFee", b.total::float8 AS total, b.currency,
               b.payment_intent_id AS "paymentIntentId", b.status, b.hold_expires_at AS "holdExpiresAt",
               b.requested_at AS "requestedAt", b.decide_by AS "decideBy", b.confirmed_at AS "confirmedAt",
               b.closed_at AS "closedAt", b.close_reason AS "closeReason",
               b.refund_amount::float8 AS "refundAmount", b.free_cancel_until AS "freeCancelUntil"
          FROM golf_bookings b
          JOIN golf_courses c ON c.id = b.course_id
          JOIN golf_tee_times t ON t.id = b.tee_time_id`;
}

export async function getBookingById(id: string): Promise<GolfBooking | null> {
    const sql = getSqlAdmin();
    const rows = await sql<BookingRow[]>`${selectBookings(sql)} WHERE b.id = ${id}`;
    return rows[0] ? toBooking(rows[0]) : null;
}

/** A customer's own booking, or null: ownership is decided here, never in a page (ADR-0027). */
export async function getBookingForUser(reference: string, userId: string): Promise<GolfBooking | null> {
    const sql = getSqlAdmin();
    const rows = await sql<BookingRow[]>`${selectBookings(sql)} WHERE b.reference = ${reference} AND b.user_id = ${userId}`;
    return rows[0] ? toBooking(rows[0]) : null;
}

export type AdminBookingView = 'waiting' | 'upcoming' | 'past';

/** The admin queue. Abandoned checkouts (expired holds) are left out of every view. */
export async function listBookingsForAdmin(view: AdminBookingView, now = new Date()): Promise<GolfBooking[]> {
    const sql = getSqlAdmin();
    const where =
        view === 'waiting' ? sql`b.status = 'requested'`
            : view === 'upcoming' ? sql`b.status = 'confirmed' AND t.starts_at >= ${now}`
                : sql`(b.status IN ('declined', 'cancelled') OR (b.status = 'confirmed' AND t.starts_at < ${now}))`;
    const order = view === 'past' ? sql`b.updated_at DESC` : sql`t.starts_at`;
    const rows = await sql<BookingRow[]>`${selectBookings(sql)} WHERE ${where} ORDER BY ${order} LIMIT 100`;
    return rows.map(toBooking);
}

// ── Money ────────────────────────────────────────────────────────────────────

/** Releases an authorisation. Already cancelled counts as done; anything else is an error. */
async function cancelIntent(paymentIntentId: string): Promise<void> {
    try {
        await stripe.paymentIntents.cancel(paymentIntentId);
    } catch (err) {
        const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
        if (intent.status !== 'canceled') throw err;
    }
}

async function cancelIntentQuietly(paymentIntentId: string): Promise<void> {
    try {
        await cancelIntent(paymentIntentId);
    } catch (err) {
        // An unpaid PaymentIntent left open charges nobody; it is noise, not a debt.
        console.warn('[golf] Could not cancel PaymentIntent', paymentIntentId, err);
    }
}

// ── Status changes ───────────────────────────────────────────────────────────

/**
 * Moves a booking from `from` to a final state and gives its spots back, in one transaction.
 * null when the booking was not in `from` (someone else moved it first).
 */
async function closeBooking(
    id: string,
    from: GolfBookingStatus,
    to: 'expired' | 'declined' | 'cancelled',
    reason: GolfCloseReason,
    refund = 0,
): Promise<{ paymentIntentId: string | null } | null> {
    const sql = getSqlAdmin();
    return sql.begin(async tx => {
        const [row] = await tx<{ teeTimeId: string; players: number; paymentIntentId: string | null }[]>`
            UPDATE golf_bookings
               SET status = ${to}, close_reason = ${reason}, closed_at = now(),
                   refund_amount = ${refund}, updated_at = now()
             WHERE id = ${id} AND status = ${from}
            RETURNING tee_time_id AS "teeTimeId", players, payment_intent_id AS "paymentIntentId"`;
        if (!row) return null;
        await tx`UPDATE golf_tee_times SET spots_left = LEAST(spots, spots_left + ${row.players}) WHERE id = ${row.teeTimeId}`;
        return { paymentIntentId: row.paymentIntentId };
    });
}

async function requireStatus(id: string, status: GolfBookingStatus): Promise<GolfBooking> {
    const booking = await getBookingById(id);
    if (!booking) throw new GolfBookingError('not_found', 'Booking not found.');
    if (booking.status !== status) throw new GolfBookingError('wrong_status', `This booking is ${booking.status}.`);
    return booking;
}

/**
 * Moves a held booking to `requested` once Stripe holds an authorisation for it. Called by the
 * webhook, the status page and the sweep; idempotent, and a no-op in any other state.
 */
export async function syncPayment(id: string, now = new Date()): Promise<GolfBooking | null> {
    const booking = await getBookingById(id);
    if (!booking || booking.status !== 'held' || !booking.paymentIntentId) return booking;
    const intent = await stripe.paymentIntents.retrieve(booking.paymentIntentId);
    if (intent.status !== 'requires_capture') return booking;

    const sql = getSqlAdmin();
    const moved = await sql`
        UPDATE golf_bookings
           SET status = 'requested', requested_at = ${now},
               decide_by = ${decideBy(now, new Date(booking.startsAt))}, updated_at = now()
         WHERE id = ${id} AND status = 'held'
        RETURNING id`;
    const updated = await getBookingById(id);
    if (moved.length > 0 && updated) await sendGolfBookingEmail('requested', updated);
    return updated;
}

/** Ends a hold, unless its payment went through after all, in which case it becomes a request. */
async function endHold(id: string, now: Date): Promise<'requested' | 'expired' | 'unchanged'> {
    const synced = await syncPayment(id, now);
    if (synced?.status === 'requested') return 'requested';
    const closed = await closeBooking(id, 'held', 'expired', 'hold_expired');
    if (!closed) return 'unchanged';
    if (closed.paymentIntentId) await cancelIntentQuietly(closed.paymentIntentId);
    return 'expired';
}

export interface HoldInput {
    userId: string;
    email: string;
    teeTimeId: string;
    players: number;
    leadName: string;
}

export interface HoldResult {
    booking: GolfBooking;
    clientSecret: string;
}

const notEnoughSpots = (spotsLeft: number) =>
    new GolfBookingError('not_enough_spots', `Only ${spotsLeft} spot(s) left at this tee time.`, { spotsLeft });

const PAYABLE = new Set(['requires_payment_method', 'requires_confirmation', 'requires_action']);

/** The checkout for an existing hold, while its payment can still be completed. */
async function resume(id: string): Promise<HoldResult | null> {
    const booking = await getBookingById(id);
    if (!booking?.paymentIntentId) return null;
    const intent = await stripe.paymentIntents.retrieve(booking.paymentIntentId);
    if (!PAYABLE.has(intent.status) || !intent.client_secret) return null;
    return { booking, clientSecret: intent.client_secret };
}

/**
 * Takes the spots and opens a manual-capture PaymentIntent for them. A repeated request for the
 * same tee time and party returns the hold the customer already has.
 */
export async function holdTeeTime(input: HoldInput, now = new Date()): Promise<HoldResult> {
    const sql = getSqlAdmin();

    // Expired holds on this tee time still count against it until they are closed, so close
    // them now rather than wait for the sweep. The customer's holds elsewhere end too: one
    // checkout at a time.
    const stale = await sql<{ id: string }[]>`
        SELECT id FROM golf_bookings
         WHERE status = 'held'
           AND ((tee_time_id = ${input.teeTimeId} AND hold_expires_at <= ${now})
             OR (user_id = ${input.userId} AND tee_time_id <> ${input.teeTimeId}))`;
    for (const { id } of stale) await endHold(id, now);

    const [live] = await sql<{ id: string; players: number }[]>`
        SELECT id, players FROM golf_bookings
         WHERE user_id = ${input.userId} AND tee_time_id = ${input.teeTimeId} AND status = 'held'`;
    if (live) {
        if (live.players === input.players) {
            const resumed = await resume(live.id);
            if (resumed) return resumed;
        }
        await endHold(live.id, now);
    }

    const bookable = await getBookableTeeTime(input.teeTimeId, now);
    if (!bookable) throw new GolfBookingError('tee_time_unavailable', 'That tee time can no longer be booked. Please pick another.');
    const { teeTime, course } = bookable;
    if (teeTime.spotsLeft < input.players) throw notEnoughSpots(teeTime.spotsLeft);

    const greenFeeTotal = round2(teeTime.pricePerPlayer * input.players);
    if (teeTime.currency !== 'USD') await refreshExchangeRates();
    const fee = golfServiceFee(greenFeeTotal, teeTime.currency, convertCurrencyStrict);
    const total = round2(fee.chargedTotal);
    const serviceFee = round2(total - greenFeeTotal);
    const brand = canonicalBrandName(process.env.NEXT_PUBLIC_BRAND_NAME);
    const reference = await mintUniqueBookingReference(brand, async ref =>
        (await sql`SELECT 1 FROM golf_bookings WHERE reference = ${ref}`).length > 0);

    let bookingId: string;
    try {
        bookingId = await sql.begin(async tx => {
            // The only guard against selling more spots than the tee time has.
            const taken = await tx`
                UPDATE golf_tee_times SET spots_left = spots_left - ${input.players}
                 WHERE id = ${teeTime.id} AND status = 'open' AND spots_left >= ${input.players}
                RETURNING spots_left`;
            if (taken.length === 0) throw notEnoughSpots(0);
            const [row] = await tx<{ id: string }[]>`
                INSERT INTO golf_bookings
                    (reference, user_id, course_id, tee_time_id, players, lead_name, contact_email,
                     price_per_player, green_fee_total, service_fee, total, currency,
                     hold_expires_at, free_cancel_until)
                VALUES
                    (${reference}, ${input.userId}, ${course.id}, ${teeTime.id}, ${input.players},
                     ${input.leadName}, ${input.email}, ${teeTime.pricePerPlayer}, ${greenFeeTotal},
                     ${serviceFee}, ${total}, ${teeTime.currency}, ${holdExpiresAt(now)},
                     ${freeCancelUntil(new Date(teeTime.startsAt), course.freeCancelHours)})
                RETURNING id`;
            return row.id;
        });
    } catch (err) {
        if (err instanceof GolfBookingError) {
            // Someone else took the spots between our read and the update.
            const [row] = await sql<{ spotsLeft: number }[]>`
                SELECT spots_left AS "spotsLeft" FROM golf_tee_times WHERE id = ${teeTime.id}`;
            throw notEnoughSpots(row?.spotsLeft ?? 0);
        }
        const e = err as { code?: string; constraint_name?: string };
        if (e?.code === '23505' && e.constraint_name === 'uq_golf_bookings_live_hold') {
            // The same customer asked twice at once, and the other request made the hold.
            throw new GolfBookingError('payment_unavailable', 'Your tee time is already being held. Please try again.');
        }
        throw err;
    }

    try {
        const intent = await stripe.paymentIntents.create({
            amount: toStripeAmount(total, teeTime.currency),
            currency: teeTime.currency.toLowerCase(),
            // Authorise now, capture when the team has confirmed with the course.
            capture_method: 'manual',
            metadata: {
                bookingReference: reference,
                brand,
                type: 'golf',
                golfBookingId: bookingId,
                userId: input.userId,
                courseSlug: course.slug,
                teeTimeStartsAt: teeTime.startsAt,
                greenFeeTotal: String(greenFeeTotal),
                serviceFee: String(serviceFee),
                markupRate: String(fee.markupRate),
            },
            description: `${reference} · ${course.name} — tee time`,
        }, { idempotencyKey: `golf-pi-${bookingId}` });
        await sql`UPDATE golf_bookings SET payment_intent_id = ${intent.id}, updated_at = now() WHERE id = ${bookingId}`;
        const booking = await getBookingById(bookingId);
        return { booking: booking!, clientSecret: intent.client_secret! };
    } catch (err) {
        console.error('[golf] Could not start payment for', reference, err);
        await closeBooking(bookingId, 'held', 'expired', 'hold_expired');
        throw new GolfBookingError('payment_unavailable', "We couldn't start the payment. Please try again.");
    }
}

/** The team has checked with the course: take the money. A failed capture changes nothing. */
export async function confirmBooking(id: string, now = new Date()): Promise<GolfBooking> {
    const booking = await requireStatus(id, 'requested');
    await stripe.paymentIntents.capture(booking.paymentIntentId!, {}, { idempotencyKey: `golf-capture-${id}` });
    const sql = getSqlAdmin();
    await sql`
        UPDATE golf_bookings SET status = 'confirmed', confirmed_at = ${now}, updated_at = now()
         WHERE id = ${id} AND status = 'requested'`;
    const updated = (await getBookingById(id))!;
    await sendGolfBookingEmail('confirmed', updated);
    return updated;
}

/** The course cannot take it, or nobody decided in time: release the card and the spots. */
export async function declineBooking(
    id: string,
    reason: 'declined_by_team' | 'not_confirmed_in_time' = 'declined_by_team',
): Promise<GolfBooking> {
    const booking = await requireStatus(id, 'requested');
    await cancelIntent(booking.paymentIntentId!);
    await closeBooking(id, 'requested', 'declined', reason);
    const updated = (await getBookingById(id))!;
    await sendGolfBookingEmail('declined', updated);
    return updated;
}

/** The customer cancels; what that does is cancellationFor's decision. */
export async function cancelByCustomer(reference: string, userId: string, now = new Date()): Promise<GolfBooking> {
    const booking = await getBookingForUser(reference, userId);
    if (!booking) throw new GolfBookingError('not_found', 'Booking not found.');
    const decision = cancellationFor(
        { status: booking.status, total: booking.total, freeCancelUntil: new Date(booking.freeCancelUntil) },
        now,
    );
    if (!decision.allowed) {
        throw new GolfBookingError(
            decision.reason,
            decision.reason === 'free_cancellation_ended'
                ? 'Free cancellation has ended for this tee time.'
                : 'This booking cannot be cancelled.',
        );
    }
    if (decision.charged) {
        await stripe.refunds.create(
            { payment_intent: booking.paymentIntentId!, amount: toStripeAmount(decision.refund, booking.currency) },
            { idempotencyKey: `golf-refund-${booking.id}` },
        );
        await closeBooking(booking.id, 'confirmed', 'cancelled', 'cancelled_by_customer', decision.refund);
    } else {
        await cancelIntent(booking.paymentIntentId!);
        await closeBooking(booking.id, 'requested', 'cancelled', 'cancelled_by_customer');
    }
    const updated = (await getBookingById(booking.id))!;
    await sendGolfBookingEmail('cancelled', updated);
    return updated;
}

/** The course closed or rain stopped play: a confirmed booking is refunded in full. */
export async function cancelByTeam(id: string): Promise<GolfBooking> {
    const booking = await requireStatus(id, 'confirmed');
    await stripe.refunds.create(
        { payment_intent: booking.paymentIntentId!, amount: toStripeAmount(booking.total, booking.currency) },
        { idempotencyKey: `golf-refund-${id}` },
    );
    await closeBooking(id, 'confirmed', 'cancelled', 'cancelled_by_team', booking.total);
    const updated = (await getBookingById(id))!;
    await sendGolfBookingEmail('cancelled', updated);
    return updated;
}

/**
 * Ends unpaid holds (or turns them into requests when the payment went through after all) and
 * declines requests nobody decided by their deadline. Run by cron every few minutes.
 */
export async function sweepGolfBookings(now = new Date()): Promise<{ requested: number; expired: number; declined: number; failed: number }> {
    const sql = getSqlAdmin();
    const result = { requested: 0, expired: 0, declined: 0, failed: 0 };

    const holds = await sql<{ id: string }[]>`
        SELECT id FROM golf_bookings
         WHERE status = 'held' AND hold_expires_at <= ${now}
         ORDER BY hold_expires_at LIMIT 200`;
    for (const { id } of holds) {
        try {
            const outcome = await endHold(id, now);
            if (outcome === 'requested') result.requested++;
            if (outcome === 'expired') result.expired++;
        } catch (err) {
            result.failed++;
            console.error('[golf] Sweep could not end hold', id, err);
        }
    }

    const overdue = await sql<{ id: string }[]>`
        SELECT id FROM golf_bookings
         WHERE status = 'requested' AND decide_by <= ${now}
         ORDER BY decide_by LIMIT 200`;
    for (const { id } of overdue) {
        try {
            await declineBooking(id, 'not_confirmed_in_time');
            result.declined++;
        } catch (err) {
            result.failed++;
            console.error('[golf] Sweep could not decline overdue request', id, err);
        }
    }
    return result;
}
```

- [ ] **Step 4: Run, expect PASS** — `DATABASE_URL=… npx vitest run src/lib/server/golf/bookings.integration.test.ts`

- [ ] **Step 5: Commit** — `git add src/lib/server/golf/bookings.ts src/lib/server/golf/bookings.integration.test.ts && git commit -m "feat(golf): booking lifecycle with authorise-then-capture"`

---

### Task 11: Customer API

**Files:** Create `src/app/api/golf/courses/[slug]/tee-times/route.ts` (+ `route.test.ts`), `src/app/api/golf/bookings/route.ts` (+ `route.test.ts`), `src/app/api/golf/bookings/[reference]/cancel/route.ts` (+ `route.test.ts`)

- [ ] **Step 1: Failing tests**

```ts file=src/app/api/golf/courses/[slug]/tee-times/route.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/server/rate-limit', () => ({ rateLimit: vi.fn(async () => ({ success: true })) }));
vi.mock('@/lib/server/golf/teeTimes', () => ({
    listAvailableTeeTimes: vi.fn(async (slug: string) => (slug === 'known' ? { timezone: 'Asia/Manila', teeTimes: [] } : null)),
}));

import { GET } from './route';
import { listAvailableTeeTimes } from '@/lib/server/golf/teeTimes';

const get = (slug: string, query: string) =>
    GET(new Request(`http://localhost/api/golf/courses/${slug}/tee-times${query}`) as never, { params: Promise.resolve({ slug }) });

describe('GET /api/golf/courses/[slug]/tee-times', () => {
    it('needs a real date', async () => {
        expect((await get('known', '?date=2026-02-30')).status).toBe(400);
        expect((await get('known', '')).status).toBe(400);
    });

    it('answers an unknown or unbookable course with 404', async () => {
        expect((await get('nowhere', '?date=2026-10-12')).status).toBe(404);
    });

    it('returns the day\'s tee times', async () => {
        const res = await get('known', '?date=2026-10-12');
        expect(await res.json()).toEqual({ success: true, data: { timezone: 'Asia/Manila', teeTimes: [] } });
        expect(listAvailableTeeTimes).toHaveBeenCalledWith('known', '2026-10-12');
    });
});
```

```ts file=src/app/api/golf/bookings/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const session = vi.hoisted(() => ({ user: { id: 'u1', email: 'ana@example.com' } as { id: string; email: string } | null }));

vi.mock('@/lib/server/auth', () => ({ getAuthenticatedUser: vi.fn(async () => ({ user: session.user, error: session.user ? null : 'Not authenticated' })) }));
vi.mock('@/lib/server/csrf', () => ({ checkCsrf: vi.fn(() => null) }));
vi.mock('@/lib/server/rate-limit', () => ({ rateLimit: vi.fn(async () => ({ success: true })) }));
vi.mock('@/lib/server/golf/bookings', () => ({
    holdTeeTime: vi.fn(async () => ({
        booking: { reference: 'CG-ABC234', holdExpiresAt: '2026-10-06T10:15:00.000Z', greenFeeTotal: 200, serviceFee: 12.2, total: 212.2, currency: 'USD' },
        clientSecret: 'pi_1_secret',
    })),
}));

import { POST } from './route';
import { holdTeeTime } from '@/lib/server/golf/bookings';
import { GolfBookingError } from '@/lib/server/golf/errors';

const teeTimeId = '6f1c2e0a-9b7d-4c1e-a2f5-3d8e1b0c7a44';
const post = (body: unknown) =>
    POST(new Request('http://localhost/api/golf/bookings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }) as never);

beforeEach(() => { session.user = { id: 'u1', email: 'ana@example.com' }; });

describe('POST /api/golf/bookings', () => {
    it('needs a logged-in customer', async () => {
        session.user = null;
        expect((await post({ teeTimeId, players: 2, leadName: 'Ana Cruz' })).status).toBe(401);
    });

    it('answers invalid input with errors per field', async () => {
        const res = await post({ teeTimeId, players: 9, leadName: '' });
        expect(res.status).toBe(400);
        expect((await res.json()).fieldErrors).toMatchObject({ players: expect.any(Array), leadName: expect.any(Array) });
    });

    it('holds the tee time for the session\'s customer and returns the client secret', async () => {
        const res = await post({ teeTimeId, players: 2, leadName: 'Ana Cruz' });
        expect(res.status).toBe(201);
        expect(holdTeeTime).toHaveBeenCalledWith({ userId: 'u1', email: 'ana@example.com', teeTimeId, players: 2, leadName: 'Ana Cruz' });
        expect((await res.json()).data).toMatchObject({ reference: 'CG-ABC234', clientSecret: 'pi_1_secret', total: 212.2 });
    });

    it('passes a refusal through with its code and detail', async () => {
        vi.mocked(holdTeeTime).mockRejectedValueOnce(new GolfBookingError('not_enough_spots', 'Only 1 spot(s) left', { spotsLeft: 1 }));
        const res = await post({ teeTimeId, players: 2, leadName: 'Ana Cruz' });
        expect(res.status).toBe(409);
        expect(await res.json()).toMatchObject({ code: 'not_enough_spots', spotsLeft: 1 });
    });
});
```

```ts file=src/app/api/golf/bookings/[reference]/cancel/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const session = vi.hoisted(() => ({ user: { id: 'u1', email: 'ana@example.com' } as { id: string; email: string } | null }));

vi.mock('@/lib/server/auth', () => ({ getAuthenticatedUser: vi.fn(async () => ({ user: session.user, error: null })) }));
vi.mock('@/lib/server/csrf', () => ({ checkCsrf: vi.fn(() => null) }));
vi.mock('@/lib/server/rate-limit', () => ({ rateLimit: vi.fn(async () => ({ success: true })) }));
vi.mock('@/lib/server/golf/bookings', () => ({
    cancelByCustomer: vi.fn(async () => ({ status: 'cancelled', refundAmount: 212.2 })),
}));

import { POST } from './route';
import { cancelByCustomer } from '@/lib/server/golf/bookings';
import { GolfBookingError } from '@/lib/server/golf/errors';

const cancel = (reference: string) =>
    POST(new Request(`http://localhost/api/golf/bookings/${reference}/cancel`, { method: 'POST' }) as never,
        { params: Promise.resolve({ reference }) });

beforeEach(() => { session.user = { id: 'u1', email: 'ana@example.com' }; });

describe('POST /api/golf/bookings/[reference]/cancel', () => {
    it('needs a logged-in customer', async () => {
        session.user = null;
        expect((await cancel('CG-ABC234')).status).toBe(401);
    });

    it('answers something that is not a reference with 404', async () => {
        expect((await cancel('nope')).status).toBe(404);
        expect(cancelByCustomer).not.toHaveBeenCalled();
    });

    it('cancels as the session\'s customer', async () => {
        const res = await cancel('CG-ABC234');
        expect(res.status).toBe(200);
        expect(cancelByCustomer).toHaveBeenCalledWith('CG-ABC234', 'u1');
        expect((await res.json()).data).toEqual({ status: 'cancelled', refundAmount: 212.2 });
    });

    it('passes a refusal through with its code', async () => {
        vi.mocked(cancelByCustomer).mockRejectedValueOnce(new GolfBookingError('free_cancellation_ended', 'Free cancellation has ended for this tee time.'));
        const res = await cancel('CG-ABC234');
        expect(res.status).toBe(409);
        expect((await res.json()).code).toBe('free_cancellation_ended');
    });
});
```

- [ ] **Step 2: Run, expect FAIL** — `npx vitest run src/app/api/golf`

- [ ] **Step 3: Implement**

```ts file=src/app/api/golf/courses/[slug]/tee-times/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/server/rate-limit';
import { listAvailableTeeTimes } from '@/lib/server/golf/teeTimes';
import { isIsoDate } from '@/lib/golf/time';

export const dynamic = 'force-dynamic';

/** Open tee times on one course-local date, for the course page's picker. Public. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
    const rl = await rateLimit(req, { limit: 60, windowMs: 60_000, prefix: 'golf-tee-times' });
    if (!rl.success) return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });

    const { slug } = await params;
    const date = new URL(req.url).searchParams.get('date') ?? '';
    if (!isIsoDate(date)) {
        return NextResponse.json({ success: false, error: 'date must be YYYY-MM-DD' }, { status: 400 });
    }

    const availability = await listAvailableTeeTimes(slug, date);
    if (!availability) return NextResponse.json({ success: false, error: 'Course not found' }, { status: 404 });
    return NextResponse.json({ success: true, data: availability });
}
```

```ts file=src/app/api/golf/bookings/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUser } from '@/lib/server/auth';
import { checkCsrf } from '@/lib/server/csrf';
import { rateLimit } from '@/lib/server/rate-limit';
import { holdRequestSchema } from '@/lib/schemas/golf';
import { holdTeeTime } from '@/lib/server/golf/bookings';
import { GolfBookingError } from '@/lib/server/golf/errors';

export const dynamic = 'force-dynamic';

function fail(status: number, error: string, extra: Record<string, unknown> = {}) {
    return NextResponse.json({ success: false, error, ...extra }, { status });
}

/** Starts a tee-time checkout: holds the spots and returns the PaymentIntent to authorise. */
export async function POST(req: NextRequest) {
    const csrfError = checkCsrf(req);
    if (csrfError) return csrfError;

    const { user } = await getAuthenticatedUser();
    if (!user) return fail(401, 'Please log in to book a tee time.');

    const rl = await rateLimit(req, { limit: 10, windowMs: 60_000, prefix: 'golf-hold', userId: user.id });
    if (!rl.success) return fail(429, 'Too many requests. Please wait a moment and try again.');

    const parsed = holdRequestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
        return fail(400, 'Some fields need attention', { fieldErrors: z.flattenError(parsed.error).fieldErrors });
    }

    try {
        const { booking, clientSecret } = await holdTeeTime({ userId: user.id, email: user.email, ...parsed.data });
        return NextResponse.json({
            success: true,
            data: {
                reference: booking.reference,
                clientSecret,
                holdExpiresAt: booking.holdExpiresAt,
                greenFeeTotal: booking.greenFeeTotal,
                serviceFee: booking.serviceFee,
                total: booking.total,
                currency: booking.currency,
            },
        }, { status: 201 });
    } catch (err) {
        if (err instanceof GolfBookingError) return fail(err.httpStatus, err.message, { code: err.code, ...err.detail });
        throw err;
    }
}
```

```ts file=src/app/api/golf/bookings/[reference]/cancel/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/server/auth';
import { checkCsrf } from '@/lib/server/csrf';
import { rateLimit } from '@/lib/server/rate-limit';
import { isBookingReference } from '@/lib/bookingReference';
import { cancelByCustomer } from '@/lib/server/golf/bookings';
import { GolfBookingError } from '@/lib/server/golf/errors';

export const dynamic = 'force-dynamic';

function fail(status: number, error: string, extra: Record<string, unknown> = {}) {
    return NextResponse.json({ success: false, error, ...extra }, { status });
}

/** The customer cancels their own tee time. Ownership is checked in the module (ADR-0027). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ reference: string }> }) {
    const csrfError = checkCsrf(req);
    if (csrfError) return csrfError;

    const { user } = await getAuthenticatedUser();
    if (!user) return fail(401, 'Please log in.');

    const rl = await rateLimit(req, { limit: 10, windowMs: 60_000, prefix: 'golf-cancel', userId: user.id });
    if (!rl.success) return fail(429, 'Too many requests. Please wait a moment and try again.');

    const { reference } = await params;
    if (!isBookingReference(reference)) return fail(404, 'Booking not found');

    try {
        const booking = await cancelByCustomer(reference, user.id);
        return NextResponse.json({ success: true, data: { status: booking.status, refundAmount: booking.refundAmount } });
    } catch (err) {
        if (err instanceof GolfBookingError) return fail(err.httpStatus, err.message, { code: err.code });
        console.error('[golf] Cancellation failed for', reference, err);
        return fail(502, "We couldn't cancel this booking right now. Please try again or contact us.");
    }
}
```

- [ ] **Step 4: Run, expect PASS** — `npx vitest run src/app/api/golf`

- [ ] **Step 5: Commit** — `git add src/app/api/golf && git commit -m "feat(golf): tee-time availability, hold and cancel endpoints"`

---

### Task 12: Admin API

**Files:** Create `src/app/api/admin/golf-schedules/route.ts` (+ test), `src/app/api/admin/golf-bookings/route.ts` (+ test)

- [ ] **Step 1: Failing tests**

```ts file=src/app/api/admin/golf-schedules/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

const auth = vi.hoisted(() => ({ result: { user: { id: 'admin-1', email: 'a@x.com' } } as unknown }));

vi.mock('@/lib/server/admin', () => ({
    requireAdmin: vi.fn(async () => auth.result),
    isAuthError: (r: unknown) => r instanceof Response,
}));
vi.mock('@/lib/server/rate-limit', () => ({ rateLimit: vi.fn(async () => ({ success: true })) }));
vi.mock('@/lib/server/admin/audit', () => ({ logAdminAction: vi.fn() }));
vi.mock('@/lib/server/golf/teeTimes', () => ({
    listSchedules: vi.fn(async () => []),
    createSchedule: vi.fn(async (_courseId: string, input: { name: string }) => ({ schedule: { id: 's1', ...input }, generated: 236 })),
    deleteSchedule: vi.fn(async () => true),
}));

import { GET, POST } from './route';
import { createSchedule, deleteSchedule } from '@/lib/server/golf/teeTimes';
import { CourseNotSchedulableError } from '@/lib/server/golf/errors';

const courseId = '6f1c2e0a-9b7d-4c1e-a2f5-3d8e1b0c7a44';
const schedule = { name: 'Weekday mornings', daysOfWeek: [1, 2, 3, 4, 5], firstTee: '06:00', lastTee: '11:00', intervalMinutes: 10, pricePerPlayer: 2500 };
const post = (body: unknown) =>
    POST(new Request('http://localhost/api/admin/golf-schedules', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }) as never);

beforeEach(() => { auth.result = { user: { id: 'admin-1', email: 'a@x.com' } }; });

describe('/api/admin/golf-schedules', () => {
    it('refuses anyone who is not an admin', async () => {
        auth.result = NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        expect((await GET(new Request(`http://localhost/api/admin/golf-schedules?courseId=${courseId}`) as never)).status).toBe(403);
    });

    it('needs a course id to list', async () => {
        expect((await GET(new Request('http://localhost/api/admin/golf-schedules') as never)).status).toBe(400);
    });

    it('creates a schedule and reports how many tee times it made', async () => {
        const res = await post({ action: 'create', courseId, schedule });
        expect(res.status).toBe(201);
        expect(await res.json()).toMatchObject({ success: true, generated: 236 });
        expect(createSchedule).toHaveBeenCalledWith(courseId, expect.objectContaining({ spots: 4, daysOfWeek: [1, 2, 3, 4, 5] }));
    });

    it('answers invalid input with errors per field', async () => {
        const res = await post({ action: 'create', courseId, schedule: { ...schedule, lastTee: '05:00' } });
        expect(res.status).toBe(400);
        expect((await res.json()).fieldErrors.lastTee).toBeDefined();
    });

    it('answers a course without a time zone with 409', async () => {
        vi.mocked(createSchedule).mockRejectedValueOnce(new CourseNotSchedulableError());
        expect((await post({ action: 'create', courseId, schedule })).status).toBe(409);
    });

    it('deletes a schedule, 404 when it is gone', async () => {
        expect((await post({ action: 'delete', id: courseId })).status).toBe(200);
        vi.mocked(deleteSchedule).mockResolvedValueOnce(false);
        expect((await post({ action: 'delete', id: courseId })).status).toBe(404);
    });
});
```

```ts file=src/app/api/admin/golf-bookings/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

const auth = vi.hoisted(() => ({ result: { user: { id: 'admin-1', email: 'a@x.com' } } as unknown }));

vi.mock('@/lib/server/admin', () => ({
    requireAdmin: vi.fn(async () => auth.result),
    isAuthError: (r: unknown) => r instanceof Response,
}));
vi.mock('@/lib/server/rate-limit', () => ({ rateLimit: vi.fn(async () => ({ success: true })) }));
vi.mock('@/lib/server/admin/audit', () => ({ logAdminAction: vi.fn() }));
vi.mock('@/lib/server/golf/bookings', () => ({
    listBookingsForAdmin: vi.fn(async () => []),
    confirmBooking: vi.fn(async () => ({ reference: 'CG-ABC234', status: 'confirmed' })),
    declineBooking: vi.fn(async () => ({ reference: 'CG-ABC234', status: 'declined' })),
    cancelByTeam: vi.fn(async () => ({ reference: 'CG-ABC234', status: 'cancelled' })),
}));

import { GET, POST } from './route';
import { confirmBooking, declineBooking, listBookingsForAdmin } from '@/lib/server/golf/bookings';
import { GolfBookingError } from '@/lib/server/golf/errors';

const id = '6f1c2e0a-9b7d-4c1e-a2f5-3d8e1b0c7a44';
const post = (body: unknown) =>
    POST(new Request('http://localhost/api/admin/golf-bookings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }) as never);

beforeEach(() => { auth.result = { user: { id: 'admin-1', email: 'a@x.com' } }; });

describe('/api/admin/golf-bookings', () => {
    it('refuses anyone who is not an admin', async () => {
        auth.result = NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        expect((await post({ action: 'confirm', id })).status).toBe(403);
    });

    it('lists a view, waiting by default', async () => {
        await GET(new Request('http://localhost/api/admin/golf-bookings') as never);
        expect(listBookingsForAdmin).toHaveBeenCalledWith('waiting');
        await GET(new Request('http://localhost/api/admin/golf-bookings?view=past') as never);
        expect(listBookingsForAdmin).toHaveBeenCalledWith('past');
    });

    it('confirms and declines', async () => {
        expect((await post({ action: 'confirm', id })).status).toBe(200);
        expect(confirmBooking).toHaveBeenCalledWith(id);
        expect((await post({ action: 'decline', id })).status).toBe(200);
        expect(declineBooking).toHaveBeenCalledWith(id, 'declined_by_team');
    });

    it('answers a booking in the wrong state with 409', async () => {
        vi.mocked(confirmBooking).mockRejectedValueOnce(new GolfBookingError('wrong_status', 'This booking is declined.'));
        expect((await post({ action: 'confirm', id })).status).toBe(409);
    });

    it('answers a Stripe refusal with 502 and its message', async () => {
        vi.mocked(confirmBooking).mockRejectedValueOnce(new Error('This PaymentIntent could not be captured'));
        const res = await post({ action: 'confirm', id });
        expect(res.status).toBe(502);
        expect((await res.json()).error).toContain('could not be captured');
    });

    it('rejects an unknown action and a missing id', async () => {
        expect((await post({ action: 'explode', id })).status).toBe(400);
        expect((await post({ action: 'confirm' })).status).toBe(400);
    });
});
```

- [ ] **Step 2: Run, expect FAIL** — `npx vitest run src/app/api/admin/golf-schedules src/app/api/admin/golf-bookings`

- [ ] **Step 3: Implement**

```ts file=src/app/api/admin/golf-schedules/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin, isAuthError } from '@/lib/server/admin';
import { rateLimit } from '@/lib/server/rate-limit';
import { logAdminAction } from '@/lib/server/admin/audit';
import { teeTimeScheduleInputSchema } from '@/lib/schemas/golf';
import { createSchedule, deleteSchedule, listSchedules } from '@/lib/server/golf/teeTimes';
import { CourseNotSchedulableError } from '@/lib/server/golf/errors';

export const dynamic = 'force-dynamic';

/** Admin management of a course's tee-time schedules. Same shape as api/admin/golf-courses. */

const idSchema = z.string().uuid();

function fail(status: number, error: string, fieldErrors?: Record<string, string[] | undefined>) {
    return NextResponse.json({ success: false, error, ...(fieldErrors ? { fieldErrors } : {}) }, { status });
}

export async function GET(req: NextRequest) {
    const rl = await rateLimit(req, { limit: 60, windowMs: 60_000, prefix: 'admin-golf-schedules' });
    if (!rl.success) return fail(429, 'Too many requests');

    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    const courseId = idSchema.safeParse(new URL(req.url).searchParams.get('courseId'));
    if (!courseId.success) return fail(400, 'courseId is required');
    return NextResponse.json({ success: true, data: await listSchedules(courseId.data) });
}

export async function POST(req: NextRequest) {
    const rl = await rateLimit(req, { limit: 20, windowMs: 60_000, prefix: 'admin-golf-schedules-post' });
    if (!rl.success) return fail(429, 'Too many requests');

    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return fail(400, 'Invalid JSON');
    const who = { adminId: auth.user.id, adminEmail: auth.user.email };

    if (body.action === 'create') {
        const courseId = idSchema.safeParse(body.courseId);
        if (!courseId.success) return fail(400, 'courseId is required');
        const parsed = teeTimeScheduleInputSchema.safeParse(body.schedule);
        if (!parsed.success) return fail(400, 'Some fields need attention', z.flattenError(parsed.error).fieldErrors);
        try {
            const result = await createSchedule(courseId.data, parsed.data);
            if (!result) return fail(404, 'Course not found');
            logAdminAction({
                action: 'create_golf_schedule', ...who, targetId: result.schedule.id,
                details: { courseId: courseId.data, generated: result.generated },
            });
            return NextResponse.json({ success: true, data: result.schedule, generated: result.generated }, { status: 201 });
        } catch (err) {
            if (err instanceof CourseNotSchedulableError) return fail(409, err.message);
            throw err;
        }
    }

    if (body.action === 'delete') {
        const id = idSchema.safeParse(body.id);
        if (!id.success) return fail(400, 'id is required');
        if (!(await deleteSchedule(id.data))) return fail(404, 'Schedule not found');
        logAdminAction({ action: 'delete_golf_schedule', ...who, targetId: id.data });
        return NextResponse.json({ success: true });
    }

    return fail(400, `Unknown action: ${String(body.action)}`);
}
```

```ts file=src/app/api/admin/golf-bookings/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin, isAuthError } from '@/lib/server/admin';
import { rateLimit } from '@/lib/server/rate-limit';
import { logAdminAction } from '@/lib/server/admin/audit';
import {
    cancelByTeam, confirmBooking, declineBooking, listBookingsForAdmin, type AdminBookingView,
} from '@/lib/server/golf/bookings';
import { GolfBookingError } from '@/lib/server/golf/errors';

export const dynamic = 'force-dynamic';

/** The team's side of a Golf Booking: confirm (capture), decline (release), cancel (refund). */

const VIEWS: readonly AdminBookingView[] = ['waiting', 'upcoming', 'past'];
const idSchema = z.string().uuid();

function fail(status: number, error: string) {
    return NextResponse.json({ success: false, error }, { status });
}

export async function GET(req: NextRequest) {
    const rl = await rateLimit(req, { limit: 60, windowMs: 60_000, prefix: 'admin-golf-bookings' });
    if (!rl.success) return fail(429, 'Too many requests');

    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    const asked = new URL(req.url).searchParams.get('view') as AdminBookingView | null;
    const view = asked && VIEWS.includes(asked) ? asked : 'waiting';
    return NextResponse.json({ success: true, data: await listBookingsForAdmin(view) });
}

export async function POST(req: NextRequest) {
    const rl = await rateLimit(req, { limit: 30, windowMs: 60_000, prefix: 'admin-golf-bookings-post' });
    if (!rl.success) return fail(429, 'Too many requests');

    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return fail(400, 'Invalid JSON');
    const { action } = body;
    if (action !== 'confirm' && action !== 'decline' && action !== 'cancel') return fail(400, `Unknown action: ${String(action)}`);
    const id = idSchema.safeParse(body.id);
    if (!id.success) return fail(400, 'id is required');

    try {
        const booking = action === 'confirm'
            ? await confirmBooking(id.data)
            : action === 'decline'
                ? await declineBooking(id.data, 'declined_by_team')
                : await cancelByTeam(id.data);
        logAdminAction({
            action: `${action}_golf_booking`, adminId: auth.user.id, adminEmail: auth.user.email,
            targetId: id.data, details: { reference: booking.reference },
        });
        return NextResponse.json({ success: true, data: booking });
    } catch (err) {
        if (err instanceof GolfBookingError) return fail(err.httpStatus, err.message);
        // Stripe refused — a capture fails if the authorisation lapsed. Nothing was changed.
        console.error(`[golf] Admin ${action} failed for`, id.data, err);
        return fail(502, `Stripe: ${err instanceof Error ? err.message : 'payment provider error'}`);
    }
}
```

- [ ] **Step 4: Run, expect PASS** — `npx vitest run src/app/api/admin/golf-schedules src/app/api/admin/golf-bookings`

- [ ] **Step 5: Commit** — `git add src/app/api/admin/golf-schedules src/app/api/admin/golf-bookings && git commit -m "feat(golf): admin schedules and bookings endpoints"`

---

### Task 13: Crons and the Stripe webhook

**Files:** Create `src/app/api/cron/golf-sweep/route.ts` (+ `route.test.ts`), `src/app/api/cron/golf-generate-tee-times/route.ts`; Modify `src/app/api/webhooks/stripe/route.ts`, `docker/cron/crontab`, `src/app/api/admin/run-cron/route.ts`, `src/app/admin/(dashboard)/crons/CronsClient.tsx`

- [ ] **Step 1: Failing test**

```ts file=src/app/api/cron/golf-sweep/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/server/golf/bookings', () => ({
    sweepGolfBookings: vi.fn(async () => ({ requested: 0, expired: 2, declined: 1, failed: 0 })),
}));
vi.mock('@/lib/server/golf/teeTimes', () => ({ generateTeeTimes: vi.fn(async () => 120) }));

import { GET as sweep } from './route';
import { GET as generate } from '../golf-generate-tee-times/route';

const call = (handler: typeof sweep, secret?: string) =>
    handler(new Request('http://localhost/api/cron/x', { headers: secret ? { authorization: `Bearer ${secret}` } : {} }) as never);

beforeEach(() => { process.env.CRON_SECRET = 'cron-secret'; });

describe('golf crons', () => {
    it('refuse a caller without the cron secret', async () => {
        expect((await call(sweep)).status).toBe(401);
        expect((await call(generate, 'wrong')).status).toBe(401);
    });

    it('sweep bookings and report the counts', async () => {
        expect(await (await call(sweep, 'cron-secret')).json()).toEqual({ success: true, requested: 0, expired: 2, declined: 1, failed: 0 });
    });

    it('generate tee times and report how many', async () => {
        expect(await (await call(generate, 'cron-secret')).json()).toEqual({ success: true, created: 120 });
    });
});
```

- [ ] **Step 2: Run, expect FAIL** — `npx vitest run src/app/api/cron/golf-sweep`

- [ ] **Step 3: Implement**

```ts file=src/app/api/cron/golf-sweep/route.ts
/**
 * Cron: /api/cron/golf-sweep
 * Schedule: every 5 minutes
 *
 * Ends unpaid tee-time holds (or turns them into requests when the payment went through after
 * all), and declines requests the team did not decide by their deadline. CONTEXT.md, "Golf Booking".
 */

import { NextRequest, NextResponse } from 'next/server';
import { sweepGolfBookings } from '@/lib/server/golf/bookings';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const result = await sweepGolfBookings();
    return NextResponse.json({ success: true, ...result });
}
```

```ts file=src/app/api/cron/golf-generate-tee-times/route.ts
/**
 * Cron: /api/cron/golf-generate-tee-times
 * Schedule: daily
 *
 * Extends every tee-time schedule's tee times to the 60-day horizon. Idempotent: existing tee
 * times, and the spots sold on them, are left alone. CONTEXT.md, "Tee Time".
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateTeeTimes } from '@/lib/server/golf/teeTimes';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const created = await generateTeeTimes();
    return NextResponse.json({ success: true, created });
}
```

- [ ] **Step 4: Webhook** — in `src/app/api/webhooks/stripe/route.ts`, add `import { syncPayment } from '@/lib/server/golf/bookings';` with the other imports, and insert directly after `const pi = event.data.object as Stripe.PaymentIntent;` inside the `payment_intent.amount_capturable_updated` branch (before `bookingSessionId` is read):

```ts
        // Golf holds authorise too; the team captures after the course confirms. A failure is
        // left uncommitted so Stripe retries — the status page and the sweep sync it as well.
        if (pi.metadata?.type === 'golf') {
            try {
                if (pi.metadata.golfBookingId) await syncPayment(pi.metadata.golfBookingId);
            } catch (err) {
                console.error('[Webhook] Golf payment sync failed:', err);
                return NextResponse.json({ error: 'Golf payment sync failed' }, { status: 500 });
            }
            await commitEvent();
            return NextResponse.json({ received: true });
        }
```

- [ ] **Step 5: Schedule** — in `docker/cron/crontab`, under `# ── High-frequency`, add:

```
# Tee-time holds last 15 minutes and requests have a decision deadline (CONTEXT.md, "Golf Booking").
# The hold path also closes expired holds on the tee time it touches, so this is a backstop.
*/5  * * * * curl -sf -X GET  $APP_URL/api/cron/golf-sweep                    -H "Authorization: Bearer $CRON_SECRET" -o /dev/null
```
and under `# ── Daily (UTC)`:
```
0 5 * * * curl -sf -X GET $APP_URL/api/cron/golf-generate-tee-times -H "Authorization: Bearer $CRON_SECRET" -o /dev/null
```

In `src/app/api/admin/run-cron/route.ts` add `'golf-sweep',` and `'golf-generate-tee-times',` to `ALLOWED_CRONS`. In `src/app/admin/(dashboard)/crons/CronsClient.tsx` add to the list:

```ts
    { id: 'golf-sweep',                     label: 'Golf Booking Sweep',            description: 'Ends unpaid tee-time holds and declines requests past their decision deadline.', schedule: 'Every 5 min' },
    { id: 'golf-generate-tee-times',        label: 'Generate Tee Times',            description: 'Extends every golf schedule\'s tee times to the 60-day horizon.',                schedule: 'Daily' },
```

- [ ] **Step 6: Run, expect PASS** — `npx vitest run src/app/api/cron/golf-sweep` and `npx tsc --noEmit -p . 2>&1 | grep -E "webhooks/stripe|golf" || echo clean`

- [ ] **Step 7: Commit** — `git add src/app/api/cron/golf-sweep src/app/api/cron/golf-generate-tee-times src/app/api/webhooks/stripe/route.ts docker/cron/crontab src/app/api/admin/run-cron/route.ts "src/app/admin/(dashboard)/crons/CronsClient.tsx" && git commit -m "feat(golf): sweep and generation crons; webhook syncs golf authorisations"`

---

### Task 14: Storefront copy

**Files:** Modify `src/locales/{en,ja,ko,zh}.json`

- [ ] **Step 1: The keys** — each block below becomes `golf.booking` in that locale.

```json locale=en
{
  "panelTitle": "Book a tee time",
  "date": "Date",
  "players": "Players",
  "loading": "Loading tee times…",
  "none": "No tee times left on this date. Try another day.",
  "loadError": "We couldn't load tee times. Please try again.",
  "pickTime": "Available tee times",
  "spotsLeft": "{count} left",
  "continue": "Continue",
  "hint": "Times are the course's local time. Prices are per player.",
  "orAsk": "Prefer to talk to us first?",
  "checkoutTitle": "Request your tee time",
  "summaryHeading": "Your tee time",
  "course": "Course",
  "dateLabel": "Date",
  "timeLabel": "Tee time",
  "playersLabel": "Players",
  "greenFee": "Green fee ({players} × {price})",
  "serviceFee": "Service fee",
  "total": "Total",
  "leadName": "Lead player's full name",
  "leadNameHint": "The name the course will put on its tee sheet.",
  "leadNameRequired": "Enter the lead player's name.",
  "continueToPayment": "Continue to payment",
  "chargeNotice": "We reserve this amount on your card now and only charge it once the course confirms your tee time, usually within 48 hours. If the course can't take it, the reservation is released and you pay nothing.",
  "freeCancel": "Free cancellation until {date}.",
  "unavailable": "This tee time is no longer available.",
  "backToCourse": "Back to the course",
  "notEnoughSpots": "Only {count} spots are left at this time. Choose fewer players or another time.",
  "loginRequired": "Please log in to book a tee time.",
  "genericError": "Something went wrong. Please try again.",
  "bookingTitle": "Tee time booking",
  "reference": "Reference",
  "leadPlayer": "Lead player",
  "courseTime": "{time} course time",
  "status": {
    "held": { "title": "Payment not finished", "body": "We're holding this tee time for you until {time}. If you closed the payment form, go back to the course to start again." },
    "requested": { "title": "Waiting for the course", "body": "Your card is authorised for {total} but not charged. We're confirming with the course and will email you by {date}." },
    "confirmed": { "title": "Confirmed", "body": "Your tee time is booked and we've charged {total}." },
    "expired": { "title": "Hold ended", "body": "The hold ran out before payment finished. You haven't been charged." },
    "declined": { "title": "Not confirmed", "body": "We couldn't confirm this tee time with the course. Your card was not charged." },
    "cancelled": { "title": "Cancelled", "refunded": "We've refunded {amount}. It can take 5–10 business days to appear on your statement.", "notCharged": "You were not charged." }
  },
  "cancel": "Cancel booking",
  "cancelConfirm": "Yes, cancel it",
  "keep": "Keep it",
  "cancelRequestedHint": "Cancelling now releases the amount reserved on your card. You won't be charged.",
  "cancelConfirmedHint": "Free cancellation until {date}. You'll get a full refund of {total}.",
  "cancelEnded": "Free cancellation ended on {date}. Contact us if your plans change.",
  "cancelFailed": "We couldn't cancel this booking. Please try again or contact us."
}
```

```json locale=ja
{
  "panelTitle": "ティータイムを予約",
  "date": "日付",
  "players": "人数",
  "loading": "ティータイムを読み込み中…",
  "none": "この日に空いているティータイムはありません。別の日をお試しください。",
  "loadError": "ティータイムを読み込めませんでした。もう一度お試しください。",
  "pickTime": "予約可能なティータイム",
  "spotsLeft": "残り{count}枠",
  "continue": "次へ",
  "hint": "時間はゴルフ場の現地時間です。料金は1人あたりです。",
  "orAsk": "先にご相談されたい場合はこちら",
  "checkoutTitle": "ティータイムをリクエスト",
  "summaryHeading": "ご予約内容",
  "course": "ゴルフ場",
  "dateLabel": "日付",
  "timeLabel": "ティータイム",
  "playersLabel": "人数",
  "greenFee": "グリーンフィー（{players} × {price}）",
  "serviceFee": "サービス料",
  "total": "合計",
  "leadName": "代表者のフルネーム",
  "leadNameHint": "ゴルフ場のスタート表に記載されるお名前です。",
  "leadNameRequired": "代表者のお名前を入力してください。",
  "continueToPayment": "お支払いへ進む",
  "chargeNotice": "この金額をカードで仮押さえし、ゴルフ場がティータイムを確定した時点で請求します（通常48時間以内）。確定できなかった場合は仮押さえを解除し、料金は発生しません。",
  "freeCancel": "{date}まで無料でキャンセルできます。",
  "unavailable": "このティータイムは予約できなくなりました。",
  "backToCourse": "ゴルフ場のページに戻る",
  "notEnoughSpots": "この時間の残りは{count}枠です。人数を減らすか、別の時間をお選びください。",
  "loginRequired": "ティータイムを予約するにはログインしてください。",
  "genericError": "問題が発生しました。もう一度お試しください。",
  "bookingTitle": "ティータイム予約",
  "reference": "予約番号",
  "leadPlayer": "代表者",
  "courseTime": "{time}（現地時間）",
  "status": {
    "held": { "title": "お支払いが完了していません", "body": "{time}までこのティータイムを確保しています。お支払い画面を閉じた場合は、ゴルフ場のページからやり直してください。" },
    "requested": { "title": "ゴルフ場の確認待ち", "body": "{total}をカードで仮押さえしていますが、まだ請求していません。ゴルフ場に確認中で、{date}までにメールでお知らせします。" },
    "confirmed": { "title": "予約確定", "body": "ティータイムが確定し、{total}を請求しました。" },
    "expired": { "title": "確保期限切れ", "body": "お支払いが完了する前に確保期限が切れました。料金は請求されていません。" },
    "declined": { "title": "確定できませんでした", "body": "ゴルフ場でこのティータイムを確定できませんでした。カードへの請求はありません。" },
    "cancelled": { "title": "キャンセル済み", "refunded": "{amount}を返金しました。明細に反映されるまで5〜10営業日かかる場合があります。", "notCharged": "料金は請求されていません。" }
  },
  "cancel": "予約をキャンセル",
  "cancelConfirm": "キャンセルする",
  "keep": "キャンセルしない",
  "cancelRequestedHint": "今キャンセルすると、カードの仮押さえが解除されます。料金は請求されません。",
  "cancelConfirmedHint": "{date}まで無料でキャンセルでき、{total}が全額返金されます。",
  "cancelEnded": "無料キャンセルの期限は{date}に終了しました。ご予定が変わった場合はお問い合わせください。",
  "cancelFailed": "この予約をキャンセルできませんでした。もう一度お試しいただくか、お問い合わせください。"
}
```

```json locale=ko
{
  "panelTitle": "티타임 예약",
  "date": "날짜",
  "players": "인원",
  "loading": "티타임을 불러오는 중…",
  "none": "이 날짜에는 남은 티타임이 없습니다. 다른 날짜를 선택해 주세요.",
  "loadError": "티타임을 불러오지 못했습니다. 다시 시도해 주세요.",
  "pickTime": "예약 가능한 티타임",
  "spotsLeft": "{count}자리 남음",
  "continue": "계속",
  "hint": "시간은 골프장 현지 시간이며, 요금은 1인 기준입니다.",
  "orAsk": "먼저 상담하고 싶으신가요?",
  "checkoutTitle": "티타임 요청",
  "summaryHeading": "예약 내용",
  "course": "골프장",
  "dateLabel": "날짜",
  "timeLabel": "티타임",
  "playersLabel": "인원",
  "greenFee": "그린피 ({players} × {price})",
  "serviceFee": "서비스 수수료",
  "total": "합계",
  "leadName": "대표 플레이어 성명",
  "leadNameHint": "골프장 티시트에 기재될 이름입니다.",
  "leadNameRequired": "대표 플레이어 이름을 입력해 주세요.",
  "continueToPayment": "결제로 진행",
  "chargeNotice": "지금은 카드에 이 금액을 승인만 해 두고, 골프장이 티타임을 확정하면 결제합니다(보통 48시간 이내). 골프장이 예약을 받을 수 없으면 승인이 해제되며 비용은 청구되지 않습니다.",
  "freeCancel": "{date}까지 무료로 취소할 수 있습니다.",
  "unavailable": "이 티타임은 더 이상 예약할 수 없습니다.",
  "backToCourse": "골프장으로 돌아가기",
  "notEnoughSpots": "이 시간에는 {count}자리만 남아 있습니다. 인원을 줄이거나 다른 시간을 선택해 주세요.",
  "loginRequired": "티타임을 예약하려면 로그인해 주세요.",
  "genericError": "문제가 발생했습니다. 다시 시도해 주세요.",
  "bookingTitle": "티타임 예약",
  "reference": "예약 번호",
  "leadPlayer": "대표 플레이어",
  "courseTime": "{time} (현지 시간)",
  "status": {
    "held": { "title": "결제가 완료되지 않았습니다", "body": "{time}까지 이 티타임을 확보해 두었습니다. 결제 창을 닫으셨다면 골프장 페이지에서 다시 시작해 주세요." },
    "requested": { "title": "골프장 확인 대기 중", "body": "카드에 {total}이 승인되었지만 아직 결제되지 않았습니다. 골프장에 확인 중이며 {date}까지 이메일로 알려 드립니다." },
    "confirmed": { "title": "확정됨", "body": "티타임이 예약되었으며 {total}이 결제되었습니다." },
    "expired": { "title": "확보 시간 만료", "body": "결제가 완료되기 전에 확보 시간이 끝났습니다. 비용은 청구되지 않았습니다." },
    "declined": { "title": "확정되지 않음", "body": "골프장에서 이 티타임을 확정하지 못했습니다. 카드에 비용이 청구되지 않았습니다." },
    "cancelled": { "title": "취소됨", "refunded": "{amount}이 환불되었습니다. 명세서에 반영되기까지 영업일 기준 5~10일이 걸릴 수 있습니다.", "notCharged": "비용이 청구되지 않았습니다." }
  },
  "cancel": "예약 취소",
  "cancelConfirm": "네, 취소합니다",
  "keep": "유지하기",
  "cancelRequestedHint": "지금 취소하면 카드 승인이 해제되며 비용이 청구되지 않습니다.",
  "cancelConfirmedHint": "{date}까지 무료로 취소할 수 있으며 {total} 전액이 환불됩니다.",
  "cancelEnded": "무료 취소 기간이 {date}에 종료되었습니다. 일정이 바뀌면 문의해 주세요.",
  "cancelFailed": "예약을 취소하지 못했습니다. 다시 시도하시거나 문의해 주세요."
}
```

```json locale=zh
{
  "panelTitle": "预订开球时间",
  "date": "日期",
  "players": "人数",
  "loading": "正在加载开球时间…",
  "none": "该日期已没有可预订的开球时间，请换一天试试。",
  "loadError": "无法加载开球时间，请重试。",
  "pickTime": "可预订的开球时间",
  "spotsLeft": "剩余 {count} 位",
  "continue": "继续",
  "hint": "时间为球场当地时间，价格按每位球员计算。",
  "orAsk": "想先和我们沟通？",
  "checkoutTitle": "申请开球时间",
  "summaryHeading": "您的开球时间",
  "course": "球场",
  "dateLabel": "日期",
  "timeLabel": "开球时间",
  "playersLabel": "人数",
  "greenFee": "果岭费（{players} × {price}）",
  "serviceFee": "服务费",
  "total": "总计",
  "leadName": "领队球员全名",
  "leadNameHint": "球场将以此姓名登记在出发表上。",
  "leadNameRequired": "请输入领队球员姓名。",
  "continueToPayment": "继续付款",
  "chargeNotice": "我们现在会在您的卡上预授权此金额，待球场确认开球时间后才扣款（通常在 48 小时内）。如果球场无法接受预订，预授权将被释放，您无需支付任何费用。",
  "freeCancel": "{date} 前可免费取消。",
  "unavailable": "该开球时间已无法预订。",
  "backToCourse": "返回球场",
  "notEnoughSpots": "该时间仅剩 {count} 位。请减少人数或选择其他时间。",
  "loginRequired": "请登录后预订开球时间。",
  "genericError": "出错了，请重试。",
  "bookingTitle": "开球时间预订",
  "reference": "预订编号",
  "leadPlayer": "领队球员",
  "courseTime": "{time}（当地时间）",
  "status": {
    "held": { "title": "付款未完成", "body": "我们为您保留此开球时间至 {time}。如果您关闭了付款页面，请返回球场页面重新开始。" },
    "requested": { "title": "等待球场确认", "body": "您的卡已预授权 {total}，尚未扣款。我们正在与球场确认，并会在 {date} 前通过电子邮件通知您。" },
    "confirmed": { "title": "已确认", "body": "您的开球时间已预订，我们已扣款 {total}。" },
    "expired": { "title": "保留已结束", "body": "付款完成前保留时间已到。您未被扣款。" },
    "declined": { "title": "未能确认", "body": "我们无法与球场确认此开球时间。您的卡未被扣款。" },
    "cancelled": { "title": "已取消", "refunded": "我们已退款 {amount}。可能需要 5–10 个工作日才会显示在您的账单上。", "notCharged": "您未被扣款。" }
  },
  "cancel": "取消预订",
  "cancelConfirm": "确认取消",
  "keep": "保留预订",
  "cancelRequestedHint": "现在取消将释放您卡上的预授权，您不会被扣款。",
  "cancelConfirmedHint": "{date} 前可免费取消，将全额退款 {total}。",
  "cancelEnded": "免费取消已于 {date} 结束。如行程有变，请联系我们。",
  "cancelFailed": "无法取消此预订，请重试或联系我们。"
}
```

- [ ] **Step 2: Merge** (the locale files round-trip through `JSON.stringify(…, null, 2)` byte for byte, so nothing else moves):

```bash
node -e "
const fs = require('fs');
const plan = fs.readFileSync('docs/superpowers/plans/2026-10-05-golf-tee-time-booking.md', 'utf8');
for (const [, locale, body] of plan.matchAll(/\`\`\`json locale=(\w+)\n([\s\S]*?)\n\`\`\`/g)) {
  const path = 'src/locales/' + locale + '.json';
  const messages = JSON.parse(fs.readFileSync(path, 'utf8'));
  messages.golf.booking = JSON.parse(body);
  fs.writeFileSync(path, JSON.stringify(messages, null, 2) + '\n');
  console.log('merged', locale);
}"
```
Expected: `merged en`, `merged ja`, `merged ko`, `merged zh`.

- [ ] **Step 3: Run the locale tests** — `npx vitest run src/locales src/__tests__ -t "locale|parity|messages"` → PASS.

- [ ] **Step 4: Commit** — `git add src/locales && git commit -m "feat(golf): tee-time booking copy in en/ja/ko/zh"`

---

### Task 15: Course-page tee-time picker

**Files:** Modify `src/components/golf/format.ts` (whole file), `src/components/golf/TeeTimeButton.tsx` (whole file), `src/app/(main)/golf/[slug]/page.tsx`; Create `src/components/golf/TeeTimePicker.tsx`, Test `src/components/golf/TeeTimePicker.test.tsx`

- [ ] **Step 1: Failing test**

```tsx file=src/components/golf/TeeTimePicker.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import en from '@/locales/en.json';
import { TeeTimePicker } from './TeeTimePicker';

vi.mock('next-intl', () => ({
    useTranslations: (namespace: string) => (key: string, values?: Record<string, unknown>) => {
        let node: any = en;
        for (const part of `${namespace}.${key}`.split('.')) node = node?.[part];
        if (typeof node !== 'string') return `${namespace}.${key}`;
        return node.replace(/\{(\w+)\}/g, (_: string, name: string) => String(values?.[name] ?? ''));
    },
    useLocale: () => 'en',
}));

const teeTimes = [
    { id: 't1', startsAt: '2026-10-11T23:00:00.000Z', localTime: '07:00', spots: 4, spotsLeft: 4, pricePerPlayer: 2500, currency: 'PHP' },
    { id: 't2', startsAt: '2026-10-11T23:10:00.000Z', localTime: '07:10', spots: 4, spotsLeft: 1, pricePerPlayer: 2500, currency: 'PHP' },
];

const respond = (list: unknown[]) =>
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: true, data: { timezone: 'Asia/Manila', teeTimes: list } }))));

beforeEach(() => respond(teeTimes));

describe('TeeTimePicker', () => {
    it('asks for tomorrow on the course clock and lists the times', async () => {
        render(<TeeTimePicker slug="wack-wack" today="2026-10-11" />);
        expect(await screen.findByText('07:00')).toBeInTheDocument();
        expect(fetch).toHaveBeenCalledWith('/api/golf/courses/wack-wack/tee-times?date=2026-10-12');
        expect(screen.getByText('4 left', { exact: false })).toBeInTheDocument();
    });

    it('disables times without room for the party and sends the chosen one to checkout', async () => {
        render(<TeeTimePicker slug="wack-wack" today="2026-10-11" />);
        await screen.findByText('07:00');
        expect(screen.getByRole('button', { name: /07:10/ })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: /07:00/ }));
        expect(screen.getByRole('link', { name: 'Continue' })).toHaveAttribute('href', '/golf/wack-wack/book?teeTime=t1&players=2');
    });

    it('says when a date has nothing left', async () => {
        respond([]);
        render(<TeeTimePicker slug="wack-wack" today="2026-10-11" />);
        expect(await screen.findByText(en.golf.booking.none)).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run, expect FAIL** — `npx vitest run src/components/golf/TeeTimePicker.test.tsx`

- [ ] **Step 3: Implement**

```ts file=src/components/golf/format.ts
/** "$85", "₩120,000" — whole units: a "from" price is a guide, and cents make it read like a quote. */
export function formatGreenFee(amount: number, currency: string, locale: string): string {
    try {
        return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
    } catch {
        return `${currency} ${Math.round(amount)}`;
    }
}

/** "₱5,318.00" — an amount someone is paying, so the minor units are shown. */
export function formatMoney(amount: number, currency: string, locale: string): string {
    try {
        return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
    } catch {
        return `${currency} ${amount.toFixed(2)}`;
    }
}
```

```tsx file=src/components/golf/TeeTimeButton.tsx
'use client';

import { MessageCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSupportWidgetStore } from '@/stores/supportWidgetStore';

/**
 * Opens the support chat to ask about tee times (CONTEXT.md, "Golf Course"). The widget is
 * mounted by the storefront layout; this only opens it. `secondary` when it sits under the
 * tee-time picker rather than standing in for it.
 */
export function TeeTimeButton({ secondary = false }: { secondary?: boolean }) {
    const t = useTranslations('golf');
    const open = useSupportWidgetStore(s => s.open);
    return (
        <button type="button" onClick={open}
            className={secondary
                ? 'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-6 py-3 font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5'
                : 'inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white shadow-md transition hover:bg-blue-700'}>
            <MessageCircle className="h-5 w-5" aria-hidden /> {t('askTeeTimes')}
        </button>
    );
}
```

```tsx file=src/components/golf/TeeTimePicker.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { TeeTime } from '@/lib/schemas/golf';
import { addDays } from '@/lib/golf/time';
import { HORIZON_DAYS } from '@/lib/golf/rules';
import { formatMoney } from './format';

const fieldClass = 'mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-slate-100';

/**
 * Picks a tee time on the course page. Times are on the course's clock, the one the customer
 * will play by; `today` is the course-local date, worked out on the server. Tomorrow is the
 * first date offered because the team needs a day to confirm with the course.
 */
export function TeeTimePicker({ slug, today }: { slug: string; today: string }) {
    const t = useTranslations('golf.booking');
    const locale = useLocale();
    const first = addDays(today, 1);
    const [date, setDate] = useState(first);
    const [players, setPlayers] = useState(2);
    const [teeTimes, setTeeTimes] = useState<TeeTime[] | null>(null);
    const [failed, setFailed] = useState(false);
    const [selected, setSelected] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setTeeTimes(null);
        setFailed(false);
        setSelected(null);
        fetch(`/api/golf/courses/${encodeURIComponent(slug)}/tee-times?date=${date}`)
            .then(response => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
            .then(json => { if (!cancelled) setTeeTimes(json.data.teeTimes); })
            .catch(() => { if (!cancelled) setFailed(true); });
        return () => { cancelled = true; };
    }, [slug, date]);

    const chosen = teeTimes?.find(tt => tt.id === selected && tt.spotsLeft >= players);

    return (
        <div className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t('panelTitle')}</h2>
            <div className="grid grid-cols-[1fr_5rem] gap-2">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    {t('date')}
                    <input id="golf-date" type="date" value={date} min={first} max={addDays(today, HORIZON_DAYS)}
                        onChange={e => { if (e.target.value) setDate(e.target.value); }} className={fieldClass} />
                </label>
                <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    {t('players')}
                    <select id="golf-players" value={players} onChange={e => setPlayers(Number(e.target.value))} className={fieldClass}>
                        {[1, 2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                </label>
            </div>

            {teeTimes === null && !failed && (
                <p className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {t('loading')}
                </p>
            )}
            {failed && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{t('loadError')}</p>}
            {teeTimes?.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">{t('none')}</p>}

            {teeTimes && teeTimes.length > 0 && (
                <ul className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto pr-1" aria-label={t('pickTime')}>
                    {teeTimes.map(tt => {
                        const active = selected === tt.id;
                        return (
                            <li key={tt.id}>
                                <button type="button" disabled={tt.spotsLeft < players} aria-pressed={active}
                                    onClick={() => setSelected(tt.id)}
                                    className={`w-full rounded-lg border px-2 py-1.5 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${active
                                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40'
                                        : 'border-slate-200 hover:border-blue-400 dark:border-white/10'}`}>
                                    <span className="block font-semibold tabular-nums text-slate-900 dark:text-slate-100">{tt.localTime}</span>
                                    <span className="block text-xs text-slate-500 dark:text-slate-400">
                                        {t('spotsLeft', { count: tt.spotsLeft })} · {formatMoney(tt.pricePerPlayer, tt.currency, locale)}
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}

            {chosen ? (
                <Link href={`/golf/${slug}/book?teeTime=${chosen.id}&players=${players}`}
                    className="rounded-xl bg-blue-600 px-6 py-3 text-center font-semibold text-white shadow-md transition hover:bg-blue-700">
                    {t('continue')}
                </Link>
            ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">{t('hint')}</p>
            )}
        </div>
    );
}
```

- [ ] **Step 4: Course page** — in `src/app/(main)/golf/[slug]/page.tsx` add imports:

```ts
import { courseHasSchedules } from '@/lib/server/golf/teeTimes';
import { localDate } from '@/lib/golf/time';
import { TeeTimePicker } from '@/components/golf/TeeTimePicker';
```
after `if (!course) notFound();` add:
```ts
    const sellsTeeTimes = course.timezone ? await courseHasSchedules(course.id) : false;
```
and replace
```tsx
                    <p className="my-4 text-sm text-slate-500 dark:text-slate-400">{t('askTeeTimesHint')}</p>
                    <TeeTimeButton />
```
with
```tsx
                    {sellsTeeTimes ? (
                        <>
                            <div className="my-5 border-t border-slate-200 dark:border-white/10" />
                            <TeeTimePicker slug={course.slug} today={localDate(new Date(), course.timezone!)} />
                            <p className="mb-3 mt-6 text-sm text-slate-500 dark:text-slate-400">{t('booking.orAsk')}</p>
                            <TeeTimeButton secondary />
                        </>
                    ) : (
                        <>
                            <p className="my-4 text-sm text-slate-500 dark:text-slate-400">{t('askTeeTimesHint')}</p>
                            <TeeTimeButton />
                        </>
                    )}
```

- [ ] **Step 5: Run, expect PASS** — `npx vitest run src/components/golf`

- [ ] **Step 6: Commit** — `git add src/components/golf "src/app/(main)/golf/[slug]/page.tsx" && git commit -m "feat(golf): tee-time picker on the course page"`

---

### Task 16: Checkout

**Files:** Create `src/app/(main)/golf/[slug]/book/page.tsx`, `src/app/(main)/golf/[slug]/book/BookTeeTimeClient.tsx`

- [ ] **Step 1: Server page**

```tsx file=src/app/(main)/golf/[slug]/book/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { getAuthenticatedUser } from '@/lib/server/auth';
import { getBookableTeeTime } from '@/lib/server/golf/teeTimes';
import { golfServiceFee } from '@/lib/pricing';
import { convertCurrencyStrict, refreshExchangeRates } from '@/lib/currency';
import { freeCancelUntil } from '@/lib/golf/rules';
import { formatMoney } from '@/components/golf/format';
import { BookTeeTimeClient } from './BookTeeTimeClient';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false } };

type Props = {
    params: Promise<{ slug: string }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

/** Checkout for one tee time. Prices here are the same function of the same numbers the hold charges. */
export default async function BookTeeTimePage({ params, searchParams }: Props) {
    const { slug } = await params;
    const query = await searchParams;
    const teeTimeId = typeof query.teeTime === 'string' ? query.teeTime : '';
    const players = Math.min(4, Math.max(1, Number.parseInt(typeof query.players === 'string' ? query.players : '', 10) || 2));

    const { user } = await getAuthenticatedUser();
    if (!user) {
        redirect(`/login?next=${encodeURIComponent(`/golf/${slug}/book?teeTime=${encodeURIComponent(teeTimeId)}&players=${players}`)}`);
    }

    const [t, locale, bookable] = await Promise.all([
        getTranslations('golf.booking'), getLocale(), getBookableTeeTime(teeTimeId),
    ]);
    if (!bookable || bookable.course.slug !== slug) {
        return (
            <main className="mx-auto max-w-xl px-4 py-20 text-center">
                <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{t('unavailable')}</h1>
                <Link href={`/golf/${slug}`} className="mt-6 inline-block font-medium text-blue-600 hover:underline">{t('backToCourse')}</Link>
            </main>
        );
    }

    const { teeTime, course } = bookable;
    const startsAt = new Date(teeTime.startsAt);
    const greenFee = Math.round(teeTime.pricePerPlayer * players * 100) / 100;
    if (teeTime.currency !== 'USD') await refreshExchangeRates();
    const fee = golfServiceFee(greenFee, teeTime.currency, convertCurrencyStrict);
    const total = Math.round(fee.chargedTotal * 100) / 100;
    const money = (amount: number) => formatMoney(amount, teeTime.currency, locale);
    const courseClock = (options: Intl.DateTimeFormatOptions, instant: Date) =>
        new Intl.DateTimeFormat(locale, { timeZone: course.timezone, ...options }).format(instant);

    return (
        <BookTeeTimeClient
            teeTimeId={teeTime.id}
            players={players}
            summary={{
                courseName: course.name,
                courseHref: `/golf/${course.slug}`,
                date: courseClock({ dateStyle: 'full' }, startsAt),
                time: t('courseTime', { time: teeTime.localTime }),
                greenFeeLabel: t('greenFee', { players, price: money(teeTime.pricePerPlayer) }),
                greenFee: money(greenFee),
                serviceFee: money(Math.round((total - greenFee) * 100) / 100),
                total: money(total),
                freeCancel: t('freeCancel', {
                    date: courseClock({ dateStyle: 'medium', timeStyle: 'short' }, freeCancelUntil(startsAt, course.freeCancelHours)),
                }),
            }}
        />
    );
}
```

- [ ] **Step 2: Client**

```tsx file=src/app/(main)/golf/[slug]/book/BookTeeTimeClient.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import StripeEmbeddedCheckout from '@/components/checkout/StripeEmbeddedCheckout';

export interface TeeTimeSummary {
    courseName: string;
    courseHref: string;
    date: string;
    time: string;
    greenFeeLabel: string;
    greenFee: string;
    serviceFee: string;
    total: string;
    freeCancel: string;
}

/**
 * The lead player's name, then the card. The card is authorised, not charged: the team captures
 * after the course confirms (CONTEXT.md, "Golf Booking").
 */
export function BookTeeTimeClient({ teeTimeId, players, summary }: { teeTimeId: string; players: number; summary: TeeTimeSummary }) {
    const t = useTranslations('golf.booking');
    const router = useRouter();
    const [leadName, setLeadName] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [payment, setPayment] = useState<{ reference: string; clientSecret: string } | null>(null);

    const start = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const response = await fetch('/api/golf/bookings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'cheapestgo-client' },
                body: JSON.stringify({ teeTimeId, players, leadName }),
            });
            const json = await response.json().catch(() => ({}));
            if (response.ok) setPayment({ reference: json.data.reference, clientSecret: json.data.clientSecret });
            else if (json.code === 'not_enough_spots') setError(t('notEnoughSpots', { count: json.spotsLeft ?? 0 }));
            else if (json.code === 'tee_time_unavailable') setError(t('unavailable'));
            else if (json.fieldErrors?.leadName) setError(t('leadNameRequired'));
            else if (response.status === 401) setError(t('loginRequired'));
            else setError(t('genericError'));
        } catch {
            setError(t('genericError'));
        } finally {
            setBusy(false);
        }
    };

    const statusPath = payment ? `/golf/bookings/${payment.reference}` : '';
    const row = 'flex justify-between gap-4';

    return (
        <main className="mx-auto grid max-w-5xl gap-8 px-4 py-10 lg:grid-cols-[1fr_22rem]">
            <section className="flex min-w-0 flex-col gap-5">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t('checkoutTitle')}</h1>
                <p className="rounded-xl bg-blue-50 p-4 text-sm leading-relaxed text-blue-900 dark:bg-blue-950/40 dark:text-blue-100">{t('chargeNotice')}</p>
                {payment ? (
                    <StripeEmbeddedCheckout
                        clientSecret={payment.clientSecret}
                        onSuccess={() => router.push(statusPath)}
                        returnUrl={`${window.location.origin}${statusPath}`}
                    />
                ) : (
                    <form onSubmit={start} className="flex flex-col gap-2 rounded-xl border border-slate-200 p-5 dark:border-white/10">
                        <label htmlFor="lead-name" className="text-sm font-medium text-slate-700 dark:text-slate-200">{t('leadName')}</label>
                        <input id="lead-name" required maxLength={120} autoComplete="name" value={leadName}
                            onChange={e => setLeadName(e.target.value)}
                            className="rounded-lg border border-slate-200 px-3 py-2 text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-slate-100" />
                        <p className="text-xs text-slate-500 dark:text-slate-400">{t('leadNameHint')}</p>
                        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
                        <button type="submit" disabled={busy}
                            className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60">
                            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} {t('continueToPayment')}
                        </button>
                    </form>
                )}
            </section>

            <aside className="h-fit rounded-2xl border border-slate-200 p-5 text-sm dark:border-white/10">
                <h2 className="mb-3 text-base font-semibold text-slate-900 dark:text-slate-100">{t('summaryHeading')}</h2>
                <dl className="flex flex-col gap-2 text-slate-600 dark:text-slate-300">
                    <div className={row}><dt>{t('course')}</dt><dd className="text-right"><Link href={summary.courseHref} className="text-blue-600 hover:underline">{summary.courseName}</Link></dd></div>
                    <div className={row}><dt>{t('dateLabel')}</dt><dd className="text-right">{summary.date}</dd></div>
                    <div className={row}><dt>{t('timeLabel')}</dt><dd className="text-right">{summary.time}</dd></div>
                    <div className={row}><dt>{t('playersLabel')}</dt><dd className="text-right">{players}</dd></div>
                </dl>
                <dl className="mt-4 flex flex-col gap-2 border-t border-slate-200 pt-4 tabular-nums text-slate-600 dark:border-white/10 dark:text-slate-300">
                    <div className={row}><dt>{summary.greenFeeLabel}</dt><dd>{summary.greenFee}</dd></div>
                    <div className={row}><dt>{t('serviceFee')}</dt><dd>{summary.serviceFee}</dd></div>
                    <div className={`${row} font-semibold text-slate-900 dark:text-slate-100`}><dt>{t('total')}</dt><dd>{summary.total}</dd></div>
                </dl>
                <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">{summary.freeCancel}</p>
            </aside>
        </main>
    );
}
```

- [ ] **Step 3: Type-check** — `npx tsc --noEmit -p . 2>&1 | grep "golf/\[slug\]/book" || echo clean`

- [ ] **Step 4: Commit** — `git add "src/app/(main)/golf/[slug]/book" && git commit -m "feat(golf): tee-time checkout"`

---

### Task 17: Booking status page

**Files:** Create `src/components/golf/CancelGolfBookingButton.tsx`, `src/app/(main)/golf/bookings/[reference]/page.tsx`

- [ ] **Step 1: Cancel button**

```tsx file=src/components/golf/CancelGolfBookingButton.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

/** Two steps, so a stray tap never cancels a tee time. */
export function CancelGolfBookingButton({ reference }: { reference: string }) {
    const t = useTranslations('golf.booking');
    const router = useRouter();
    const [confirming, setConfirming] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const cancel = async () => {
        setBusy(true);
        setError(null);
        try {
            const response = await fetch(`/api/golf/bookings/${encodeURIComponent(reference)}/cancel`, {
                method: 'POST',
                headers: { 'X-Requested-By': 'cheapestgo-client' },
            });
            if (response.ok) router.refresh();
            else setError(t('cancelFailed'));
        } catch {
            setError(t('cancelFailed'));
        } finally {
            setBusy(false);
            setConfirming(false);
        }
    };

    return (
        <div className="flex flex-col gap-2">
            {confirming ? (
                <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={cancel} disabled={busy}
                        className="flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 font-semibold text-white hover:bg-red-700 disabled:opacity-60">
                        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} {t('cancelConfirm')}
                    </button>
                    <button type="button" onClick={() => setConfirming(false)} disabled={busy}
                        className="rounded-xl border border-slate-300 px-5 py-2.5 font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5">
                        {t('keep')}
                    </button>
                </div>
            ) : (
                <button type="button" onClick={() => setConfirming(true)}
                    className="self-start rounded-xl border border-red-300 px-5 py-2.5 font-semibold text-red-700 hover:bg-red-50 dark:border-red-500/40 dark:text-red-300 dark:hover:bg-red-950/30">
                    {t('cancel')}
                </button>
            )}
            {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>
    );
}
```

- [ ] **Step 2: Status page**

```tsx file=src/app/(main)/golf/bookings/[reference]/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { getAuthenticatedUser } from '@/lib/server/auth';
import { getBookingForUser, syncPayment } from '@/lib/server/golf/bookings';
import { isBookingReference } from '@/lib/bookingReference';
import { cancellationFor } from '@/lib/golf/rules';
import { localTime } from '@/lib/golf/time';
import { formatMoney } from '@/components/golf/format';
import { CancelGolfBookingButton } from '@/components/golf/CancelGolfBookingButton';
import { TeeTimeButton } from '@/components/golf/TeeTimeButton';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false } };

type Props = { params: Promise<{ reference: string }> };

/** One customer's tee-time booking: where it stands, what it cost, and what they can still do. */
export default async function GolfBookingPage({ params }: Props) {
    const { reference } = await params;
    const { user } = await getAuthenticatedUser();
    if (!user) redirect(`/login?next=${encodeURIComponent(`/golf/bookings/${reference}`)}`);
    if (!isBookingReference(reference)) notFound();

    const found = await getBookingForUser(reference, user.id);
    if (!found) notFound();
    // A redirect payment method, or a closed tab, can land the customer here before the webhook.
    const booking = found.status === 'held' ? ((await syncPayment(found.id).catch(() => null)) ?? found) : found;

    const [t, locale] = await Promise.all([getTranslations('golf.booking'), getLocale()]);
    const tz = booking.timezone ?? 'UTC';
    const money = (amount: number) => formatMoney(amount, booking.currency, locale);
    const courseClock = (iso: string, options: Intl.DateTimeFormatOptions) =>
        new Intl.DateTimeFormat(locale, { timeZone: tz, ...options }).format(new Date(iso));
    const dateTime = (iso: string) => courseClock(iso, { dateStyle: 'medium', timeStyle: 'short' });

    const body = {
        held: t('status.held.body', { time: localTime(new Date(booking.holdExpiresAt), tz) }),
        requested: t('status.requested.body', { total: money(booking.total), date: dateTime(booking.decideBy ?? booking.startsAt) }),
        confirmed: t('status.confirmed.body', { total: money(booking.total) }),
        expired: t('status.expired.body'),
        declined: t('status.declined.body'),
        cancelled: booking.refundAmount > 0
            ? t('status.cancelled.refunded', { amount: money(booking.refundAmount) })
            : t('status.cancelled.notCharged'),
    }[booking.status];

    const Icon = booking.status === 'confirmed' ? CheckCircle2
        : booking.status === 'held' || booking.status === 'requested' ? Clock : XCircle;
    const tone = booking.status === 'confirmed' ? 'text-emerald-600'
        : booking.status === 'held' || booking.status === 'requested' ? 'text-amber-500' : 'text-slate-400';

    const cancellation = cancellationFor(
        { status: booking.status, total: booking.total, freeCancelUntil: new Date(booking.freeCancelUntil) },
        new Date(),
    );
    const row = 'flex justify-between gap-4';

    return (
        <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
            <header className="flex items-start gap-3">
                <Icon className={`mt-1 h-7 w-7 shrink-0 ${tone}`} aria-hidden />
                <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{t('bookingTitle')} · {booking.reference}</p>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t(`status.${booking.status}.title`)}</h1>
                    <p className="mt-2 text-slate-600 dark:text-slate-300">{body}</p>
                </div>
            </header>

            <section className="rounded-2xl border border-slate-200 p-5 text-sm dark:border-white/10">
                <dl className="flex flex-col gap-2 text-slate-600 dark:text-slate-300">
                    <div className={row}><dt>{t('course')}</dt><dd className="text-right"><Link href={`/golf/${booking.courseSlug}`} className="text-blue-600 hover:underline">{booking.courseName}</Link></dd></div>
                    <div className={row}><dt>{t('dateLabel')}</dt><dd className="text-right">{courseClock(booking.startsAt, { dateStyle: 'full' })}</dd></div>
                    <div className={row}><dt>{t('timeLabel')}</dt><dd className="text-right">{t('courseTime', { time: localTime(new Date(booking.startsAt), tz) })}</dd></div>
                    <div className={row}><dt>{t('playersLabel')}</dt><dd className="text-right">{booking.players}</dd></div>
                    <div className={row}><dt>{t('leadPlayer')}</dt><dd className="text-right">{booking.leadName}</dd></div>
                    <div className={row}><dt>{t('reference')}</dt><dd className="text-right font-mono">{booking.reference}</dd></div>
                </dl>
                <dl className="mt-4 flex flex-col gap-2 border-t border-slate-200 pt-4 tabular-nums text-slate-600 dark:border-white/10 dark:text-slate-300">
                    <div className={row}><dt>{t('greenFee', { players: booking.players, price: money(booking.pricePerPlayer) })}</dt><dd>{money(booking.greenFeeTotal)}</dd></div>
                    <div className={row}><dt>{t('serviceFee')}</dt><dd>{money(booking.serviceFee)}</dd></div>
                    <div className={`${row} font-semibold text-slate-900 dark:text-slate-100`}><dt>{t('total')}</dt><dd>{money(booking.total)}</dd></div>
                </dl>
            </section>

            {booking.status === 'held' && (
                <Link href={`/golf/${booking.courseSlug}`} className="self-start font-medium text-blue-600 hover:underline">{t('backToCourse')}</Link>
            )}

            {cancellation.allowed && (
                <section className="flex flex-col gap-3">
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                        {cancellation.charged
                            ? t('cancelConfirmedHint', { date: dateTime(booking.freeCancelUntil), total: money(booking.total) })
                            : t('cancelRequestedHint')}
                    </p>
                    <CancelGolfBookingButton reference={booking.reference} />
                </section>
            )}

            {!cancellation.allowed && cancellation.reason === 'free_cancellation_ended' && (
                <section className="flex flex-col gap-3">
                    <p className="text-sm text-slate-600 dark:text-slate-300">{t('cancelEnded', { date: dateTime(booking.freeCancelUntil) })}</p>
                    <div><TeeTimeButton secondary /></div>
                </section>
            )}
        </main>
    );
}
```

- [ ] **Step 3: Type-check** — `npx tsc --noEmit -p . 2>&1 | grep -E "golf/bookings|CancelGolfBookingButton" || echo clean`

- [ ] **Step 4: Commit** — `git add src/components/golf/CancelGolfBookingButton.tsx "src/app/(main)/golf/bookings" && git commit -m "feat(golf): booking status page with cancellation"`

---

### Task 18: Admin course form — time zone and free cancellation

**Files:** Modify `src/app/admin/(dashboard)/golf/GolfCourseForm.tsx`, Test `src/app/admin/(dashboard)/golf/GolfCourseForm.test.tsx`

- [ ] **Step 1: Failing test** — append inside the `describe`:

```tsx
    it('sends the time zone and free-cancellation hours', async () => {
        const onSubmit = vi.fn(async () => undefined);
        render(<GolfCourseForm onSubmit={onSubmit} onCancel={vi.fn()} />);
        type(/^name/i, 'Wack Wack');
        type(/^country/i, 'Philippines');
        type(/^city/i, 'Manila');
        type(/^time zone/i, 'Asia/Manila');
        type(/^free cancellation/i, '72');
        fireEvent.click(screen.getByRole('button', { name: /save/i }));

        await waitFor(() => expect(onSubmit).toHaveBeenCalled());
        expect((onSubmit.mock.calls[0] as unknown[])[0]).toMatchObject({ timezone: 'Asia/Manila', freeCancelHours: 72 });
    });
```

- [ ] **Step 2: Run, expect FAIL** — `npx vitest run "src/app/admin/(dashboard)/golf/GolfCourseForm.test.tsx"`

- [ ] **Step 3: Implement** — in `GolfCourseForm.tsx`:

Below `AMENITY_LABELS`, add:
```ts
/** Suggestions only: any IANA name is accepted and checked on the server. */
const COMMON_TIME_ZONES = [
    'Asia/Manila', 'Asia/Seoul', 'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Taipei',
    'Asia/Singapore', 'Asia/Kuala_Lumpur', 'Asia/Bangkok', 'Asia/Ho_Chi_Minh', 'Asia/Jakarta',
    'Asia/Dubai', 'Australia/Sydney', 'Europe/London', 'America/New_York', 'America/Los_Angeles',
];
```

After the `description` state, add:
```ts
    const [timezone, setTimezone] = useState(initial?.timezone ?? '');
    const [freeCancelHours, setFreeCancelHours] = useState(String(initial?.freeCancelHours ?? 48));
```

In `submit`, the object passed to `onSubmit` gains:
```ts
                timezone, freeCancelHours: Number(freeCancelHours),
```

Directly after the holes/par/green fee/currency grid, add:
```tsx
            <div className="grid gap-4 sm:grid-cols-2">
                {field('timezone', 'Time zone', (
                    <>
                        <input id="timezone" list="golf-time-zones" className={`${inputClass} font-mono`} value={timezone}
                            onChange={e => setTimezone(e.target.value)} placeholder="Asia/Manila" />
                        <datalist id="golf-time-zones">{COMMON_TIME_ZONES.map(zone => <option key={zone} value={zone} />)}</datalist>
                    </>
                ), 'Needed before adding tee times. Tee times are set on this clock.')}
                {field('freeCancelHours', 'Free cancellation (hours before tee time)', (
                    <input id="freeCancelHours" type="number" min="0" max="720" className={inputClass} value={freeCancelHours}
                        onChange={e => setFreeCancelHours(e.target.value)} />
                ), 'Recorded on each booking when it is made.')}
            </div>
```

- [ ] **Step 4: Run, expect PASS** — `npx vitest run "src/app/admin/(dashboard)/golf"`

- [ ] **Step 5: Commit** — `git add "src/app/admin/(dashboard)/golf/GolfCourseForm.tsx" "src/app/admin/(dashboard)/golf/GolfCourseForm.test.tsx" && git commit -m "feat(golf): course time zone and free cancellation in admin"`

---

### Task 19: Admin tee-time schedules

**Files:** Create `src/app/admin/(dashboard)/golf/TeeTimeSchedules.tsx`; Modify `src/app/admin/(dashboard)/golf/GolfCoursesClient.tsx`

- [ ] **Step 1: Schedules panel**

```tsx file=src/app/admin/(dashboard)/golf/TeeTimeSchedules.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Trash2 } from 'lucide-react';
import type { GolfCourse, TeeTimeSchedule, TeeTimeScheduleInputRaw } from '@/lib/schemas/golf';

/** Admin-only, so English (CONTEXT.md, "Interface Language"). */
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const inputClass =
    'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5';

type FieldErrors = Partial<Record<string, string[]>>;

async function call(body: Record<string, unknown>) {
    const response = await fetch('/api/admin/golf-schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const json = await response.json().catch(() => ({}));
    return { ok: response.ok, json: json as { error?: string; fieldErrors?: FieldErrors; generated?: number } };
}

function describeDays(days: number[]): string {
    const key = days.join(',');
    if (key === '0,1,2,3,4,5,6') return 'Every day';
    if (key === '1,2,3,4,5') return 'Mon–Fri';
    if (key === '0,6') return 'Sat, Sun';
    return days.map(d => DAYS[d]).join(', ');
}

/** The tee-time schedules of one course: what it sells, when, and at what price. */
export function TeeTimeSchedules({ course }: { course: GolfCourse }) {
    const [schedules, setSchedules] = useState<TeeTimeSchedule[] | null>(null);
    const [name, setName] = useState('');
    const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
    const [firstTee, setFirstTee] = useState('06:00');
    const [lastTee, setLastTee] = useState('11:00');
    const [intervalMinutes, setIntervalMinutes] = useState('10');
    const [spots, setSpots] = useState('4');
    const [price, setPrice] = useState('');
    const [errors, setErrors] = useState<FieldErrors>({});
    const [saving, setSaving] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

    const load = useCallback(async () => {
        const response = await fetch(`/api/admin/golf-schedules?courseId=${course.id}`);
        const json = await response.json().catch(() => ({}));
        if (!response.ok) toast.error(json.error ?? 'Could not load schedules');
        setSchedules(response.ok ? json.data : []);
    }, [course.id]);

    useEffect(() => {
        if (course.timezone) void load();
    }, [course.timezone, load]);

    if (!course.timezone) {
        return (
            <p className="text-sm text-slate-600 dark:text-slate-300">
                Set this course&apos;s time zone first (Edit course → Time zone). Tee times are created on the course&apos;s own clock.
            </p>
        );
    }

    const add = async (event: React.FormEvent) => {
        event.preventDefault();
        setSaving(true);
        setErrors({});
        try {
            const schedule: TeeTimeScheduleInputRaw = {
                name, daysOfWeek: days, firstTee, lastTee,
                intervalMinutes: Number(intervalMinutes), spots: Number(spots), pricePerPlayer: Number(price),
            };
            const { ok, json } = await call({ action: 'create', courseId: course.id, schedule });
            if (!ok) {
                setErrors(json.fieldErrors ?? {});
                toast.error(json.error ?? 'Could not add the schedule');
                return;
            }
            toast.success(`Schedule added: ${json.generated ?? 0} tee times created`);
            setName('');
            setPrice('');
            await load();
        } finally {
            setSaving(false);
        }
    };

    const remove = async (id: string) => {
        setConfirmDelete(null);
        const { ok, json } = await call({ action: 'delete', id });
        if (!ok) toast.error(json.error ?? 'Could not delete the schedule');
        else toast.success('Schedule deleted. Tee times with bookings are kept.');
        await load();
    };

    const error = (field: string) =>
        errors[field]?.[0] ? <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors[field]![0]}</p> : null;
    const label = 'mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300';

    return (
        <div className="flex flex-col gap-5">
            <p className="text-xs text-slate-500 dark:text-slate-400">
                Times are in {course.timezone}. Prices are per player, in {course.currency}. Tee times are created 60 days ahead and topped up daily.
            </p>

            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10">
                <table className="w-full min-w-[560px] text-left text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-white/5 dark:text-slate-400">
                        <tr>
                            <th className="px-3 py-2 font-medium">Name</th>
                            <th className="px-3 py-2 font-medium">Days</th>
                            <th className="px-3 py-2 font-medium">Tee times</th>
                            <th className="px-3 py-2 font-medium">Spots</th>
                            <th className="px-3 py-2 font-medium">Per player</th>
                            <th className="px-3 py-2" />
                        </tr>
                    </thead>
                    <tbody>
                        {schedules === null && (
                            <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></td></tr>
                        )}
                        {schedules?.length === 0 && (
                            <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">No schedules yet. Add one below to start selling tee times.</td></tr>
                        )}
                        {schedules?.map(s => (
                            <tr key={s.id} className="border-t border-slate-100 dark:border-white/5">
                                <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">{s.name}</td>
                                <td className="px-3 py-2">{describeDays(s.daysOfWeek)}</td>
                                <td className="px-3 py-2 tabular-nums">{s.firstTee}–{s.lastTee}, every {s.intervalMinutes} min</td>
                                <td className="px-3 py-2 tabular-nums">{s.spots}</td>
                                <td className="px-3 py-2 tabular-nums">{course.currency} {s.pricePerPlayer}</td>
                                <td className="px-3 py-2 text-right">
                                    {confirmDelete === s.id ? (
                                        <span className="flex items-center justify-end gap-1">
                                            <span className="text-xs text-slate-500">Delete?</span>
                                            <button type="button" onClick={() => void remove(s.id)} className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30">Yes</button>
                                            <button type="button" onClick={() => setConfirmDelete(null)} className="rounded px-2 py-1 text-xs hover:bg-slate-100 dark:hover:bg-white/10">No</button>
                                        </span>
                                    ) : (
                                        <button type="button" aria-label={`Delete ${s.name}`} title="Delete" onClick={() => setConfirmDelete(s.id)}
                                            className="rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"><Trash2 className="h-4 w-4" /></button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <form onSubmit={add} className="flex flex-col gap-4 rounded-xl border border-slate-200 p-4 dark:border-white/10">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Add a schedule</h3>
                <div>
                    <label htmlFor="schedule-name" className={label}>Name</label>
                    <input id="schedule-name" className={inputClass} value={name} onChange={e => setName(e.target.value)} placeholder="Weekday mornings" />
                    {error('name')}
                </div>
                <fieldset>
                    <legend className={label}>Days</legend>
                    <div className="flex flex-wrap gap-3">
                        {DAYS.map((day, index) => (
                            <label key={day} className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-200">
                                <input type="checkbox" checked={days.includes(index)}
                                    onChange={e => setDays(current => e.target.checked ? [...current, index] : current.filter(d => d !== index))} />
                                {day}
                            </label>
                        ))}
                    </div>
                    {error('daysOfWeek')}
                </fieldset>
                <div className="grid gap-4 sm:grid-cols-5">
                    <div>
                        <label htmlFor="schedule-first" className={label}>First tee</label>
                        <input id="schedule-first" type="time" className={inputClass} value={firstTee} onChange={e => setFirstTee(e.target.value)} />
                        {error('firstTee')}
                    </div>
                    <div>
                        <label htmlFor="schedule-last" className={label}>Last tee</label>
                        <input id="schedule-last" type="time" className={inputClass} value={lastTee} onChange={e => setLastTee(e.target.value)} />
                        {error('lastTee')}
                    </div>
                    <div>
                        <label htmlFor="schedule-interval" className={label}>Every (min)</label>
                        <input id="schedule-interval" type="number" min="5" max="60" className={inputClass} value={intervalMinutes} onChange={e => setIntervalMinutes(e.target.value)} />
                        {error('intervalMinutes')}
                    </div>
                    <div>
                        <label htmlFor="schedule-spots" className={label}>Spots</label>
                        <input id="schedule-spots" type="number" min="1" max="4" className={inputClass} value={spots} onChange={e => setSpots(e.target.value)} />
                        {error('spots')}
                    </div>
                    <div>
                        <label htmlFor="schedule-price" className={label}>Price ({course.currency})</label>
                        <input id="schedule-price" type="number" min="0" step="0.01" className={inputClass} value={price} onChange={e => setPrice(e.target.value)} />
                        {error('pricePerPlayer')}
                    </div>
                </div>
                <div className="flex justify-end">
                    <button type="submit" disabled={saving}
                        className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50">
                        {saving && <Loader2 className="h-4 w-4 animate-spin" />} Add schedule
                    </button>
                </div>
            </form>
        </div>
    );
}
```

- [ ] **Step 2: Wire it into the courses screen** — in `GolfCoursesClient.tsx`:

Imports: add `CalendarCheck, Clock` to the lucide import, and `import { TeeTimeSchedules } from './TeeTimeSchedules';`.

State, after `confirmDelete`:
```ts
    /** The course whose tee-time schedules are open, if any. */
    const [scheduling, setScheduling] = useState<GolfCourse | null>(null);
```

In the header, wrap the "Add course" button so a Bookings link sits beside it:
```tsx
                <div className="flex items-center gap-2">
                    <Link href="/admin/golf/bookings"
                        className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5">
                        <CalendarCheck className="h-4 w-4" /> Bookings
                    </Link>
                    {/* the existing "Add course" button, unchanged */}
                </div>
```

In each row's actions, before the Edit button:
```tsx
                                                <button type="button" aria-label={`Tee times for ${course.name}`} title="Tee times" onClick={() => setScheduling(course)}
                                                    className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"><Clock className="h-4 w-4" /></button>
```

After the existing `</Dialog>`:
```tsx
            <Dialog open={scheduling !== null} onOpenChange={open => { if (!open) setScheduling(null); }}>
                <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>Tee times · {scheduling?.name}</DialogTitle>
                    </DialogHeader>
                    {scheduling && <TeeTimeSchedules key={scheduling.id} course={scheduling} />}
                </DialogContent>
            </Dialog>
```

- [ ] **Step 3: Type-check and run** — `npx tsc --noEmit -p . 2>&1 | grep "admin/(dashboard)/golf" || echo clean`; `npx vitest run "src/app/admin/(dashboard)/golf"`

- [ ] **Step 4: Commit** — `git add "src/app/admin/(dashboard)/golf" && git commit -m "feat(golf): tee-time schedules in admin"`

---

### Task 20: Admin bookings queue

**Files:** Create `src/app/admin/(dashboard)/golf/bookings/page.tsx`, `src/app/admin/(dashboard)/golf/bookings/GolfBookingsClient.tsx`; Modify `src/components/admin/Sidebar.tsx`

- [ ] **Step 1: Page**

```tsx file=src/app/admin/(dashboard)/golf/bookings/page.tsx
import { listBookingsForAdmin, type AdminBookingView } from '@/lib/server/golf/bookings';
import { GolfBookingsClient } from './GolfBookingsClient';

export const dynamic = 'force-dynamic';

const VIEWS: readonly AdminBookingView[] = ['waiting', 'upcoming', 'past'];

/** Golf Bookings in the admin. The dashboard layout already refuses anyone who is not an admin. */
export default async function AdminGolfBookingsPage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const params = await searchParams;
    const asked = typeof params.view === 'string' ? (params.view as AdminBookingView) : 'waiting';
    const view = VIEWS.includes(asked) ? asked : 'waiting';
    const bookings = await listBookingsForAdmin(view);
    return <GolfBookingsClient bookings={bookings} view={view} />;
}
```

- [ ] **Step 2: Client**

```tsx file=src/app/admin/(dashboard)/golf/bookings/GolfBookingsClient.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CalendarCheck, Loader2 } from 'lucide-react';
import type { GolfBooking } from '@/lib/schemas/golf';

/** Admin-only, so English (CONTEXT.md, "Interface Language"). */

type View = 'waiting' | 'upcoming' | 'past';
type Action = 'confirm' | 'decline' | 'cancel';

const TABS: { view: View; label: string; hint: string }[] = [
    {
        view: 'waiting', label: 'Waiting for us',
        hint: 'Check each request with the course, then Confirm (takes the payment) or Decline (releases it). Requests nobody decides are declined automatically at their deadline.',
    },
    { view: 'upcoming', label: 'Upcoming', hint: 'Confirmed tee times still to be played. Cancel and refund in full if the course closes.' },
    { view: 'past', label: 'Past & closed', hint: 'Played, declined and cancelled bookings, newest first.' },
];

const STATUS_STYLE: Record<GolfBooking['status'], string> = {
    held: 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300',
    requested: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
    confirmed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300',
    expired: 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300',
    declined: 'bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300',
    cancelled: 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300',
};

/** "Sat 10 Oct, 07:38" on the course's clock — the time the course will recognise. */
function courseTime(iso: string, tz: string | null): string {
    return new Intl.DateTimeFormat('en-GB', {
        timeZone: tz ?? 'UTC', weekday: 'short', day: 'numeric', month: 'short',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).format(new Date(iso));
}

export function GolfBookingsClient({ bookings, view }: { bookings: GolfBooking[]; view: View }) {
    const router = useRouter();
    const [busy, setBusy] = useState<string | null>(null);
    const [confirming, setConfirming] = useState<{ id: string; action: Action } | null>(null);

    const act = async (id: string, action: Action, done: string) => {
        setConfirming(null);
        setBusy(id);
        try {
            const response = await fetch('/api/admin/golf-bookings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, id }),
            });
            const json = await response.json().catch(() => ({}));
            if (!response.ok) {
                toast.error(json.error ?? 'Something went wrong');
                return;
            }
            toast.success(done);
            router.refresh();
        } finally {
            setBusy(null);
        }
    };

    const ask = (booking: GolfBooking, action: Action, label: string, done: string) =>
        confirming?.id === booking.id && confirming.action === action ? (
            <span className="flex items-center gap-1">
                <span className="text-xs text-slate-500">{label}?</span>
                <button type="button" onClick={() => void act(booking.id, action, done)} className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30">Yes</button>
                <button type="button" onClick={() => setConfirming(null)} className="rounded px-2 py-1 text-xs hover:bg-slate-100 dark:hover:bg-white/10">No</button>
            </span>
        ) : (
            <button type="button" onClick={() => setConfirming({ id: booking.id, action })}
                className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5">
                {label}
            </button>
        );

    return (
        <div className="flex flex-col gap-4">
            <header>
                <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
                    <CalendarCheck className="h-5 w-5" /> Golf Bookings
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">{TABS.find(tab => tab.view === view)!.hint}</p>
            </header>

            <nav className="flex gap-1 border-b border-slate-200 dark:border-white/10" aria-label="Views">
                {TABS.map(tab => (
                    <Link key={tab.view} href={tab.view === 'waiting' ? '/admin/golf/bookings' : `/admin/golf/bookings?view=${tab.view}`}
                        aria-current={tab.view === view ? 'page' : undefined}
                        className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab.view === view
                            ? 'border-blue-600 text-blue-600'
                            : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'}`}>
                        {tab.label}
                    </Link>
                ))}
            </nav>

            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10">
                <table className="w-full min-w-[880px] text-left text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-white/5 dark:text-slate-400">
                        <tr>
                            <th className="px-4 py-2 font-medium">Reference</th>
                            <th className="px-4 py-2 font-medium">Course</th>
                            <th className="px-4 py-2 font-medium">Tee time (course time)</th>
                            <th className="px-4 py-2 font-medium">Players</th>
                            <th className="px-4 py-2 font-medium">Customer</th>
                            <th className="px-4 py-2 font-medium">Total</th>
                            <th className="px-4 py-2 font-medium">{view === 'waiting' ? 'Decide by' : 'Status'}</th>
                            <th className="px-4 py-2 text-right font-medium">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {bookings.length === 0 && (
                            <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">Nothing here.</td></tr>
                        )}
                        {bookings.map(b => (
                            <tr key={b.id} className="border-t border-slate-100 align-top dark:border-white/5">
                                <td className="px-4 py-2 font-mono text-xs">{b.reference}</td>
                                <td className="px-4 py-2">{b.courseName}</td>
                                <td className="px-4 py-2 tabular-nums">{courseTime(b.startsAt, b.timezone)}</td>
                                <td className="px-4 py-2 tabular-nums">{b.players}</td>
                                <td className="px-4 py-2">
                                    <span className="block text-slate-900 dark:text-slate-100">{b.leadName}</span>
                                    <span className="block text-xs text-slate-500">{b.contactEmail}</span>
                                </td>
                                <td className="px-4 py-2 tabular-nums">{b.currency} {b.total.toFixed(2)}</td>
                                <td className="px-4 py-2">
                                    {view === 'waiting' && b.decideBy ? (
                                        <span className="tabular-nums">{courseTime(b.decideBy, b.timezone)}</span>
                                    ) : (
                                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[b.status]}`}>{b.status}</span>
                                    )}
                                </td>
                                <td className="px-4 py-2">
                                    <span className="flex items-center justify-end gap-2">
                                        {busy === b.id && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
                                        {busy !== b.id && b.status === 'requested' && (
                                            <>
                                                <button type="button" onClick={() => void act(b.id, 'confirm', `${b.reference} confirmed and charged`)}
                                                    className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-500">
                                                    Confirm
                                                </button>
                                                {ask(b, 'decline', 'Decline', `${b.reference} declined; the card was released`)}
                                            </>
                                        )}
                                        {busy !== b.id && view === 'upcoming' && b.status === 'confirmed' &&
                                            ask(b, 'cancel', 'Cancel & refund', `${b.reference} cancelled and refunded`)}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
```

- [ ] **Step 3: Sidebar** — in `src/components/admin/Sidebar.tsx` add `CalendarCheck` to the lucide import and, after the Golf Courses entry:

```ts
            { label: 'Golf Bookings', href: '/admin/golf/bookings', icon: CalendarCheck },
```

- [ ] **Step 4: Type-check** — `npx tsc --noEmit -p . 2>&1 | grep -E "golf/bookings|Sidebar" || echo clean`

- [ ] **Step 5: Commit** — `git add "src/app/admin/(dashboard)/golf/bookings" src/components/admin/Sidebar.tsx && git commit -m "feat(golf): bookings queue in admin"`

---

### Task 21: Glossary

**Files:** Modify `CONTEXT.md`

- [ ] **Step 1:** Replace the **Golf Course** entry (its paragraph and `_Avoid_` line) with:

```markdown
**Golf Course** — a course CheapestGo can arrange play at, curated by the team in the admin (`golf_courses`). There is no supplier behind it, and the **green fee from** figure is an indicative price for the listing, never a quote. A course is a *draft* until an admin publishes it; only published courses reach the storefront, and that rule lives in `lib/server/golf/courses`, not in pages. A course with a time zone and at least one schedule sells **Tee Times**; every course can still be asked about in the support chat ("Ask about tee times"). Course names and descriptions are written once by the team and are not per-language.
_Avoid_: calling the green fee a price the customer will pay.

**Tee Time** — one start time at a Golf Course with 1–4 spots, generated from a weekly schedule the team sets in admin (`golf_tee_time_schedules` → `golf_tee_times`), stored as an instant and always shown on the course's own clock. Our tee times are not the course's tee sheet: selling one is a promise to *ask* the course, which is why a Golf Booking is a request until the team confirms it. Spots are taken by one conditional update and given back in the same transaction that closes a booking (`lib/server/golf/bookings`).
_Avoid_: calling a tee time the course's live availability — it is our allocation.

**Golf Booking** — a customer's request for a Tee Time (`golf_bookings`): `held` while they pay (15 minutes), `requested` once the card is authorised, `confirmed` when the team has checked with the course and captured the payment. A request the team declines, or does not decide within 48 hours (or 2 hours before the tee time), is `declined` and never charged. A confirmed booking is refunded in full, fee included, until the free-cancellation cutoff recorded on it; after that it cannot be cancelled online.
_Avoid_: saying a requested booking is paid — the card is only authorised.
```

- [ ] **Step 2: Commit** — `git add CONTEXT.md && git commit -m "docs(golf): Tee Time and Golf Booking glossary entries"`

---

### Task 22: Verification

- [ ] **Step 1: Types** — `npx tsc --noEmit -p .` → no errors.
- [ ] **Step 2: Lint** — `npm run lint` → no new errors in golf files.
- [ ] **Step 3: Unit and route tests** — `npx vitest run` → all pass.
- [ ] **Step 4: Database tests** — `DATABASE_URL=… npx vitest run src/lib/server/golf` → all pass, none skipped.
- [ ] **Step 5: Manual, with Stripe test keys** — in admin, give a published course a time zone and a schedule; on its page pick a tee time, log in, pay with `4242 4242 4242 4242`; the status page shows "Waiting for the course" and Stripe shows the PaymentIntent as uncaptured; Confirm in `/admin/golf/bookings` → captured, status "Confirmed"; repeat and Decline → PaymentIntent cancelled; cancel a confirmed one as the customer → refunded.

---

## Execution notes (2026-10-05)

Executed task by task in this session; every task's tests were seen failing first, then passing. Departures from the plan above, each in its own commit:

- **Task 13:** the webhook also skips golf intents in its `payment_intent.succeeded` branch. A capture there is the team confirming in admin; without the skip every golf capture logged a false "missing bookingSessionId" error.
- **Integration tests:** the tee-time and booking suites backdate their courses before publishing them. `courses.integration.test.ts` asks for the newest published courses in the whole database and ran beside them; it failed about one run in four until then.
- **Found by the manual run against Stripe test mode** (QA course, user and session created for the run and deleted after it):
  - `GOLF_MARKUP_SPEC` now follows the *configured* hotel spec. It had copied the hotel defaults, so with `HOTEL_MARKUP_PERCENTAGE=0.05` set, golf charged 5.9%.
  - Checkout and the confirmation email no longer promise "free cancellation until" a time already past. A tee time booked inside the course's window says free cancellation has ended (`golf.booking.noFreeCancel`).
- **Manual run, verified:** generation cron (236 tee times), picker only on courses with schedules, login redirect keeps the checkout URL, CSRF refusals (403), hold → test card → `requires_capture`, status page sync → `requested` with the right deadline, admin confirm → captured, admin decline → cancelled with nothing charged, customer cancel → full refund, spots restored each time, all five emails sent (to Resend's `delivered@resend.dev` sink).
- **Not exercised:** the webhook's golf branch (needs the Stripe CLI forwarding events to a local server); the status page and the sweep perform the same sync, and both were exercised.
