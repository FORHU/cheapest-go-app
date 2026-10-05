# Golf — Publishing Requires Tee Times Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A published golf course is always bookable: publishing needs a time zone and a schedule, admin guides the admin there, and the four demo courses get tee times.

**Architecture:** Three server rules in `lib/server/golf` (R1 publish needs time zone + schedule, R2 time zone locked while schedules exist, R3 a published course keeps its last schedule) raise typed errors the admin API turns into 409s. The admin course list shows a Booking badge; Publish on a course that needs tee times opens the Tee times window, which gains a time zone field and a Publish button. Spec: `docs/superpowers/specs/2026-10-05-golf-publish-requires-tee-times-design.md`.

**Tech Stack:** Next.js 15, postgres.js, zod 4, Vitest + Testing Library (happy-dom).

**Code blocks:** a fence with `file=<path>` is the complete file. Other blocks are the exact snippet to insert or the replacement for the quoted original.

**Database tests:** `DATABASE_URL=$(grep '^DATABASE_URL=' .env | cut -d= -f2-) npx vitest run <file>`

---

## File map

| File | Change |
| --- | --- |
| `src/lib/server/golf/errors.ts` | `CourseNotBookableError`, `TimezoneLockedError`, `LastScheduleError` |
| `src/lib/server/golf/courses.ts` | R1 in `setCourseStatus`, R2 in `updateCourse`, new `setCourseTimezone`, `bookable` on admin rows |
| `src/lib/server/golf/courses.integration.test.ts` | helper adds a schedule before publishing; R1, R2, `bookable` tests |
| `src/lib/server/golf/teeTimes.ts` | R3 in `deleteSchedule` |
| `src/lib/server/golf/teeTimes.integration.test.ts` | deleted-schedule test covers R3 |
| `src/lib/server/golf/bookings.integration.test.ts` | schedule before publish |
| `src/app/api/admin/golf-courses/route.ts` (+ test) | 409s for R1/R2, `set-timezone` action |
| `src/app/api/admin/golf-schedules/route.ts` (+ test) | 409 for R3 |
| `src/app/admin/(dashboard)/golf/timeZones.ts` | new — `COMMON_TIME_ZONES` |
| `src/app/admin/(dashboard)/golf/GolfCourseForm.tsx` | imports `COMMON_TIME_ZONES` |
| `src/app/admin/(dashboard)/golf/TeeTimeSchedules.tsx` | time zone field, Publish button |
| `src/app/admin/(dashboard)/golf/GolfCoursesClient.tsx` (+ new test) | Booking column; Publish opens Tee times when not bookable |

---

### Task 1: Course rules R1 and R2

**Files:** Modify `src/lib/server/golf/errors.ts`, `src/lib/server/golf/courses.ts`, `src/lib/server/golf/courses.integration.test.ts`

- [ ] **Step 1: Failing tests** — in `courses.integration.test.ts`:

Imports: add `setCourseTimezone` to the `./courses` import and replace the errors import with
```ts
import { CourseNotBookableError, SlugTakenError, TimezoneLockedError } from './errors';
```

Replace `make` with:
```ts
/** A schedule row only: publishing needs one, these tests need no tee times. */
async function addSchedule(courseId: string) {
    const { getSqlAdmin } = await import('@/lib/db/postgres');
    await getSqlAdmin()`
        INSERT INTO golf_tee_time_schedules
            (course_id, name, days_of_week, first_tee, last_tee, interval_minutes, spots, price_per_player)
        VALUES (${courseId}, 'Test', '{1}', '07:00', '07:00', 10, 4, 100)`;
}

async function make(over: Partial<GolfCourseInput> = {}, publish = false) {
    const course = await createCourse(input(publish ? { timezone: 'Asia/Manila', ...over } : over));
    created.push(course.id);
    if (publish) {
        // Published means bookable (CONTEXT.md, "Golf Course").
        await addSchedule(course.id);
        await setCourseStatus(course.id, 'published');
    }
    return course;
}
```

Append inside the `describe`:
```ts
    it('publishes only a course that can be booked', async () => {
        const course = await make();
        await expect(setCourseStatus(course.id, 'published')).rejects.toBeInstanceOf(CourseNotBookableError);
        await setCourseTimezone(course.id, 'Asia/Manila');
        await expect(setCourseStatus(course.id, 'published')).rejects.toBeInstanceOf(CourseNotBookableError);
        await addSchedule(course.id);
        expect(await setCourseStatus(course.id, 'published')).toBe(true);
        expect(await setCourseStatus(crypto.randomUUID(), 'published')).toBe(false);
    });

    it('locks the time zone while the course has schedules', async () => {
        const course = await make({ timezone: 'Asia/Manila' });
        await addSchedule(course.id);
        await expect(setCourseTimezone(course.id, 'Asia/Tokyo')).rejects.toBeInstanceOf(TimezoneLockedError);
        await expect(updateCourse(course.id, input({ slug: course.slug, timezone: null }))).rejects.toBeInstanceOf(TimezoneLockedError);
        const renamed = await updateCourse(course.id, input({ slug: course.slug, timezone: 'Asia/Manila', name: 'Same clock' }));
        expect(renamed?.name).toBe('Same clock');
        expect(await setCourseTimezone(crypto.randomUUID(), 'Asia/Tokyo')).toBeNull();
    });

    it('tells the admin which courses can be booked', async () => {
        const ready = await make({ name: `Bookable ${run}` }, true);
        const notYet = await make({ name: `Bookable ${run} later` });
        const result = await listCoursesForAdmin({ q: `Bookable ${run}`, page: 1 });
        expect(Object.fromEntries(result.courses.map(c => [c.id, c.bookable]))).toEqual({ [ready.id]: true, [notYet.id]: false });
    });
```

- [ ] **Step 2: Run, expect FAIL** — the database test command on `src/lib/server/golf/courses.integration.test.ts` → `setCourseTimezone` is not a function / errors not exported.

- [ ] **Step 3: Errors** — append to `src/lib/server/golf/errors.ts`:

```ts
/** Published means bookable: publishing needs a time zone and at least one tee-time schedule. */
export class CourseNotBookableError extends Error {
    constructor() {
        super('Add a time zone and at least one tee-time schedule before publishing this course.');
        this.name = 'CourseNotBookableError';
    }
}

/** Tee times were generated on the course's clock, so it cannot change while schedules exist. */
export class TimezoneLockedError extends Error {
    constructor() {
        super("This course has tee-time schedules, so its time zone can't change. Delete its schedules first.");
        this.name = 'TimezoneLockedError';
    }
}

/** A published course must stay bookable, so its last schedule cannot go. */
export class LastScheduleError extends Error {
    constructor() {
        super("This is the course's last schedule. Unpublish the course before deleting it.");
        this.name = 'LastScheduleError';
    }
}
```

- [ ] **Step 4: courses.ts**

Errors import becomes:
```ts
import { CourseHasBookingsError, CourseNotBookableError, SlugTakenError, TimezoneLockedError } from './errors';
```

`plain` becomes generic so admin rows keep `bookable`:
```ts
function plain<T extends GolfCourse>(rows: readonly T[]): T[] {
    return rows.map(row => ({ ...row, currency: row.currency.trim() }));
}
```

Add below `isSlugConflict`:
```ts
/** The course's clock and whether it has schedules; undefined when there is no such course. */
async function clockState(sql: postgres.Sql, id: string) {
    const [row] = await sql<{ timezone: string | null; hasSchedules: boolean }[]>`
        SELECT c.timezone,
               EXISTS (SELECT 1 FROM golf_tee_time_schedules s WHERE s.course_id = c.id) AS "hasSchedules"
          FROM golf_courses c WHERE c.id = ${id}`;
    return row;
}
```

Replace `AdminCoursePage` and the row query in `listCoursesForAdmin`:
```ts
/** An admin list row: the course, and whether customers can book it. */
export type AdminGolfCourse = GolfCourse & { bookable: boolean };

export interface AdminCoursePage {
    courses: AdminGolfCourse[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}
```
```ts
        sql<AdminGolfCourse[]>`
            SELECT ${columns(sql)},
                   (timezone IS NOT NULL AND EXISTS (
                       SELECT 1 FROM golf_tee_time_schedules s WHERE s.course_id = golf_courses.id)) AS bookable
              FROM golf_courses ${where}
             ORDER BY updated_at DESC
             LIMIT ${ADMIN_PAGE_SIZE} OFFSET ${(current - 1) * ADMIN_PAGE_SIZE}`,
```

In `updateCourse`, before the `try`:
```ts
    const state = await clockState(sql, id);
    if (!state) return null;
    // Tee times were generated on this clock (and a published course must keep one).
    if (state.hasSchedules && state.timezone !== input.timezone) throw new TimezoneLockedError();
```

Replace `setCourseStatus` with:
```ts
/**
 * false when no course has this id. Publishing is refused unless the course can be booked — a
 * time zone and at least one schedule — so a published course always offers tee times.
 */
export async function setCourseStatus(id: string, status: GolfCourseStatus): Promise<boolean> {
    const sql = getSqlAdmin();
    if (status === 'draft') {
        const rows = await sql`UPDATE golf_courses SET status = 'draft', updated_at = now() WHERE id = ${id} RETURNING id`;
        return rows.length > 0;
    }
    const rows = await sql`
        UPDATE golf_courses c SET status = 'published', updated_at = now()
         WHERE c.id = ${id} AND c.timezone IS NOT NULL
           AND EXISTS (SELECT 1 FROM golf_tee_time_schedules s WHERE s.course_id = c.id)
        RETURNING c.id`;
    if (rows.length > 0) return true;
    if (await clockState(sql, id)) throw new CourseNotBookableError();
    return false;
}

/** Sets the clock a course's tee times are on; null when no course has this id. */
export async function setCourseTimezone(id: string, timezone: string): Promise<GolfCourse | null> {
    const sql = getSqlAdmin();
    const state = await clockState(sql, id);
    if (!state) return null;
    if (state.hasSchedules && state.timezone !== timezone) throw new TimezoneLockedError();
    const rows = await sql<GolfCourse[]>`
        UPDATE golf_courses SET timezone = ${timezone}, updated_at = now() WHERE id = ${id}
        RETURNING ${columns(sql)}`;
    return plain(rows)[0] ?? null;
}
```

- [ ] **Step 5: Run, expect PASS** — the database test command on `src/lib/server/golf/courses.integration.test.ts`.

- [ ] **Step 6: Commit** — `git add src/lib/server/golf && git commit -m "feat(golf): publishing needs a time zone and a schedule; the time zone locks once tee times exist"`

---

### Task 2: Rule R3, and the suites that publish

**Files:** Modify `src/lib/server/golf/teeTimes.ts`, `teeTimes.integration.test.ts`, `bookings.integration.test.ts`

- [ ] **Step 1: Failing test** — in `teeTimes.integration.test.ts`, import `setCourseStatus` from `./courses` (already imported) and `LastScheduleError` from `./errors`, and replace the test "takes a deleted schedule's unbooked tee times with it" with:

```ts
    it('takes a deleted schedule\'s unbooked tee times with it, but never a published course\'s last', async () => {
        const c = await make();
        const early = await createSchedule(c.id, daily, NOW);
        const late = await createSchedule(c.id, { ...daily, name: 'Daily late', firstTee: '09:00', lastTee: '09:00' }, NOW);
        await setCourseStatus(c.id, 'published');

        expect(await deleteSchedule(early!.schedule.id, NOW)).toBe(true);
        expect((await listAvailableTeeTimes(c.slug, '2030-01-08', NOW))?.teeTimes.map(t => t.localTime)).toEqual(['09:00']);

        await expect(deleteSchedule(late!.schedule.id, NOW)).rejects.toBeInstanceOf(LastScheduleError);
        await setCourseStatus(c.id, 'draft');
        expect(await deleteSchedule(late!.schedule.id, NOW)).toBe(true);
        expect(await courseHasSchedules(c.id)).toBe(false);
        expect(await deleteSchedule(late!.schedule.id, NOW)).toBe(false);
    });
```

In `bookings.integration.test.ts` `beforeAll`, move `await setCourseStatus(courseId, 'published');` to after the `createSchedule(...)` call (publishing needs the schedule).

- [ ] **Step 2: Run, expect FAIL** — the database test command on `src/lib/server/golf/teeTimes.integration.test.ts` → the last-schedule delete resolves instead of rejecting.

- [ ] **Step 3: teeTimes.ts** — import `LastScheduleError` beside `CourseNotSchedulableError`, and at the start of `deleteSchedule`'s transaction, before the first `DELETE`:

```ts
        const [schedule] = await tx<{ published: boolean; others: number }[]>`
            SELECT c.status = 'published' AS published,
                   (SELECT count(*)::int FROM golf_tee_time_schedules o
                     WHERE o.course_id = s.course_id AND o.id <> s.id) AS others
              FROM golf_tee_time_schedules s
              JOIN golf_courses c ON c.id = s.course_id
             WHERE s.id = ${id}
               FOR UPDATE OF c`;
        if (!schedule) return false;
        // Published means bookable: the last schedule stays until the course is unpublished.
        if (schedule.published && schedule.others === 0) throw new LastScheduleError();
```

- [ ] **Step 4: Run, expect PASS** — the database test command on `src/lib/server/golf` (all four suites).

- [ ] **Step 5: Commit** — `git add src/lib/server/golf && git commit -m "feat(golf): a published course keeps its last schedule"`

---

### Task 3: Admin API

**Files:** Modify `src/app/api/admin/golf-courses/route.ts` (+ test), `src/app/api/admin/golf-schedules/route.ts` (+ test)

- [ ] **Step 1: Failing tests**

`golf-courses/route.test.ts`: add `setCourseTimezone: vi.fn(async (id: string, timezone: string) => ({ id, timezone })),` to the courses mock; import `setCourseStatus, setCourseTimezone, updateCourse` and `CourseNotBookableError, TimezoneLockedError`; append:
```ts
    it('answers publishing a course that cannot be booked with 409', async () => {
        vi.mocked(setCourseStatus).mockRejectedValueOnce(new CourseNotBookableError());
        const res = await post({ action: 'publish', id: crypto.randomUUID() });
        expect(res.status).toBe(409);
        expect((await res.json()).error).toContain('time zone');
    });

    it('answers a locked time zone with 409 on the field', async () => {
        vi.mocked(updateCourse).mockRejectedValueOnce(new TimezoneLockedError());
        const res = await post({ action: 'update', id: crypto.randomUUID(), course });
        expect(res.status).toBe(409);
        expect((await res.json()).fieldErrors.timezone).toBeDefined();
    });

    it('sets a time zone, refusing an invented one', async () => {
        const id = crypto.randomUUID();
        expect((await post({ action: 'set-timezone', id, timezone: 'Mars/Base' })).status).toBe(400);
        const res = await post({ action: 'set-timezone', id, timezone: 'Asia/Manila' });
        expect(res.status).toBe(200);
        expect(setCourseTimezone).toHaveBeenCalledWith(id, 'Asia/Manila');
    });
```

`golf-schedules/route.test.ts`: import `LastScheduleError` from errors; append:
```ts
    it('refuses deleting a published course\'s last schedule with 409', async () => {
        vi.mocked(deleteSchedule).mockRejectedValueOnce(new LastScheduleError());
        expect((await post({ action: 'delete', id: courseId })).status).toBe(409);
    });
```

- [ ] **Step 2: Run, expect FAIL** — `npx vitest run src/app/api/admin/golf-courses src/app/api/admin/golf-schedules`

- [ ] **Step 3: golf-courses route** — imports: add `setCourseTimezone` to the courses import, `CourseNotBookableError, TimezoneLockedError` to the errors import, and `import { isValidTimeZone } from '@/lib/golf/time';`. Before the `if (action === 'delete')` block add:

```ts
        if (action === 'set-timezone') {
            const id = idSchema.safeParse(body.id);
            if (!id.success) return fail(400, 'id is required');
            const timezone = typeof body.timezone === 'string' ? body.timezone.trim() : '';
            if (!isValidTimeZone(timezone)) {
                return fail(400, 'Some fields need attention', { timezone: ['Use a time zone name such as Asia/Manila'] });
            }
            const updated = await setCourseTimezone(id.data, timezone);
            if (!updated) return fail(404, 'Course not found');
            logAdminAction({ action: 'set_golf_course_timezone', ...who, targetId: id.data, details: { timezone } });
            return NextResponse.json({ success: true, data: updated });
        }
```
and in the `catch`, before `throw err`:
```ts
        if (err instanceof CourseNotBookableError) return fail(409, err.message);
        if (err instanceof TimezoneLockedError) return fail(409, err.message, { timezone: [err.message] });
```

- [ ] **Step 4: golf-schedules route** — import `LastScheduleError` beside `CourseNotSchedulableError`; replace the delete action's call with:

```ts
        try {
            if (!(await deleteSchedule(id.data))) return fail(404, 'Schedule not found');
        } catch (err) {
            if (err instanceof LastScheduleError) return fail(409, err.message);
            throw err;
        }
```

- [ ] **Step 5: Run, expect PASS** — `npx vitest run src/app/api/admin/golf-courses src/app/api/admin/golf-schedules`

- [ ] **Step 6: Commit** — `git add src/app/api/admin/golf-courses src/app/api/admin/golf-schedules && git commit -m "feat(golf): admin API enforces bookable publishing; set a course time zone"`

---

### Task 4: Admin UI

**Files:** Create `src/app/admin/(dashboard)/golf/timeZones.ts`, `GolfCoursesClient.test.tsx`; Modify `GolfCourseForm.tsx`, `TeeTimeSchedules.tsx` (whole file), `GolfCoursesClient.tsx`

- [ ] **Step 1: Failing test**

```tsx file=src/app/admin/(dashboard)/golf/GolfCoursesClient.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { AdminCoursePage, AdminGolfCourse } from '@/lib/server/golf/courses';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { GolfCoursesClient } from './GolfCoursesClient';

const draft: AdminGolfCourse = {
    id: 'c1', slug: 'wack-wack', name: 'Wack Wack', country: 'Philippines', city: 'Manila', address: null,
    description: '', holes: 18, par: 72, greenFeeFrom: 85, currency: 'USD', imageUrls: [], amenities: [],
    status: 'draft', timezone: null, freeCancelHours: 48, bookable: false,
};
const page = (courses: AdminGolfCourse[]): AdminCoursePage => ({ courses, total: courses.length, page: 1, pageSize: 20, totalPages: 1 });

beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: true, data: [] }))));
});

describe('GolfCoursesClient', () => {
    it('says which courses customers can book', () => {
        const ready = { ...draft, id: 'c2', name: 'Ready', status: 'published' as const, timezone: 'Asia/Manila', bookable: true };
        render(<GolfCoursesClient data={page([draft, ready])} q="" />);
        expect(screen.getByText('Needs tee times')).toBeInTheDocument();
        expect(screen.getByText('Bookable')).toBeInTheDocument();
    });

    it('opens the tee times window instead of publishing a course that cannot be booked', async () => {
        render(<GolfCoursesClient data={page([draft])} q="" />);
        fireEvent.click(screen.getByRole('button', { name: 'Publish Wack Wack' }));
        expect(await screen.findByText('Tee times · Wack Wack')).toBeInTheDocument();
        expect(screen.getByText('Add a time zone and at least one schedule to publish this course.')).toBeInTheDocument();
        expect(screen.getByLabelText('Time zone')).toBeInTheDocument();
        expect(fetch).not.toHaveBeenCalledWith('/api/admin/golf-courses', expect.anything());
    });
});
```

- [ ] **Step 2: Run, expect FAIL** — `npx vitest run "src/app/admin/(dashboard)/golf/GolfCoursesClient.test.tsx"`

- [ ] **Step 3: Time zones**

```ts file=src/app/admin/(dashboard)/golf/timeZones.ts
/** Suggestions for the time zone fields. Any IANA name is accepted and checked on the server. */
export const COMMON_TIME_ZONES = [
    'Asia/Manila', 'Asia/Seoul', 'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Taipei',
    'Asia/Singapore', 'Asia/Kuala_Lumpur', 'Asia/Bangkok', 'Asia/Ho_Chi_Minh', 'Asia/Jakarta',
    'Asia/Dubai', 'Australia/Sydney', 'Europe/London', 'America/New_York', 'America/Los_Angeles',
];
```

In `GolfCourseForm.tsx`, delete the local `COMMON_TIME_ZONES` constant and its comment, and add `import { COMMON_TIME_ZONES } from './timeZones';`.

- [ ] **Step 4: Tee times window**

```tsx file=src/app/admin/(dashboard)/golf/TeeTimeSchedules.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Trash2 } from 'lucide-react';
import type { GolfCourse, TeeTimeSchedule, TeeTimeScheduleInputRaw } from '@/lib/schemas/golf';
import { COMMON_TIME_ZONES } from './timeZones';

/** Admin-only, so English (CONTEXT.md, "Interface Language"). */
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const inputClass =
    'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5';

type FieldErrors = Partial<Record<string, string[]>>;
type Reply = { error?: string; fieldErrors?: FieldErrors; generated?: number; data?: GolfCourse };

async function call(url: string, body: Record<string, unknown>) {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const json = await response.json().catch(() => ({}));
    return { ok: response.ok, json: json as Reply };
}

function describeDays(days: number[]): string {
    const key = days.join(',');
    if (key === '0,1,2,3,4,5,6') return 'Every day';
    if (key === '1,2,3,4,5') return 'Mon–Fri';
    if (key === '0,6') return 'Sat, Sun';
    return days.map(d => DAYS[d]).join(', ');
}

/**
 * Everything a course needs before customers can book it — its time zone and its tee-time
 * schedules — and, for a draft, the Publish button, which works once both exist (CONTEXT.md,
 * "Golf Course": published means bookable).
 */
export function TeeTimeSchedules({ course, publishHint = false, onChanged }: {
    course: GolfCourse;
    /** Opened from Publish: say what is missing. */
    publishHint?: boolean;
    /** The course list is stale: a time zone was saved or the course was published. */
    onChanged?: () => void;
}) {
    const [timezone, setTimezone] = useState(course.timezone);
    const [status, setStatus] = useState(course.status);
    const [zone, setZone] = useState('');
    const [schedules, setSchedules] = useState<TeeTimeSchedule[] | null>(null);
    const [name, setName] = useState('');
    const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
    const [firstTee, setFirstTee] = useState('06:00');
    const [lastTee, setLastTee] = useState('11:00');
    const [intervalMinutes, setIntervalMinutes] = useState('10');
    const [spots, setSpots] = useState('4');
    const [price, setPrice] = useState('');
    const [errors, setErrors] = useState<FieldErrors>({});
    const [busy, setBusy] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

    const load = useCallback(async () => {
        const response = await fetch(`/api/admin/golf-schedules?courseId=${course.id}`);
        const json = await response.json().catch(() => ({}));
        if (!response.ok) toast.error(json.error ?? 'Could not load schedules');
        setSchedules(response.ok ? json.data : []);
    }, [course.id]);

    useEffect(() => {
        if (timezone) void load();
    }, [timezone, load]);

    const error = (field: string) =>
        errors[field]?.[0] ? <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors[field]![0]}</p> : null;
    const label = 'mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300';
    const hint = publishHint && status === 'draft' ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            Add a time zone and at least one schedule to publish this course.
        </p>
    ) : null;

    const saveZone = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setErrors({});
        try {
            const { ok, json } = await call('/api/admin/golf-courses', { action: 'set-timezone', id: course.id, timezone: zone });
            if (!ok) {
                setErrors(json.fieldErrors ?? {});
                toast.error(json.error ?? 'Could not save the time zone');
                return;
            }
            setTimezone(json.data?.timezone ?? zone.trim());
            toast.success('Time zone saved');
            onChanged?.();
        } finally {
            setBusy(false);
        }
    };

    if (!timezone) {
        return (
            <form onSubmit={saveZone} className="flex flex-col gap-4">
                {hint}
                <div>
                    <label htmlFor="schedule-timezone" className={label}>Time zone</label>
                    <input id="schedule-timezone" list="schedule-time-zones" className={`${inputClass} font-mono`}
                        value={zone} onChange={e => setZone(e.target.value)} placeholder="Asia/Manila" />
                    <datalist id="schedule-time-zones">{COMMON_TIME_ZONES.map(z => <option key={z} value={z} />)}</datalist>
                    <p className="mt-1 text-[11px] text-slate-400">Tee times are created on this clock. It can&apos;t change once the course has schedules.</p>
                    {error('timezone')}
                </div>
                <div className="flex justify-end">
                    <button type="submit" disabled={busy || !zone.trim()}
                        className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50">
                        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save time zone
                    </button>
                </div>
            </form>
        );
    }

    const add = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setErrors({});
        try {
            const schedule: TeeTimeScheduleInputRaw = {
                name, daysOfWeek: days, firstTee, lastTee,
                intervalMinutes: Number(intervalMinutes), spots: Number(spots), pricePerPlayer: Number(price),
            };
            const { ok, json } = await call('/api/admin/golf-schedules', { action: 'create', courseId: course.id, schedule });
            if (!ok) {
                setErrors(json.fieldErrors ?? {});
                toast.error(json.error ?? 'Could not add the schedule');
                return;
            }
            toast.success(`Schedule added: ${json.generated ?? 0} tee times created`);
            setName('');
            setPrice('');
            await load();
            onChanged?.();
        } finally {
            setBusy(false);
        }
    };

    const remove = async (id: string) => {
        setConfirmDelete(null);
        const { ok, json } = await call('/api/admin/golf-schedules', { action: 'delete', id });
        if (!ok) toast.error(json.error ?? 'Could not delete the schedule');
        else toast.success('Schedule deleted. Tee times with bookings are kept.');
        await load();
        onChanged?.();
    };

    const publish = async () => {
        setBusy(true);
        try {
            const { ok, json } = await call('/api/admin/golf-courses', { action: 'publish', id: course.id });
            if (!ok) {
                toast.error(json.error ?? 'Could not publish the course');
                return;
            }
            setStatus('published');
            toast.success('Course published. Customers can book it now.');
            onChanged?.();
        } finally {
            setBusy(false);
        }
    };

    const ready = (schedules?.length ?? 0) > 0;

    return (
        <div className="flex flex-col gap-5">
            {hint}
            <p className="text-xs text-slate-500 dark:text-slate-400">
                Times are in {timezone}{ready ? ' (locked while the course has schedules)' : ''}. Prices are per player, in {course.currency}. Tee times are created 60 days ahead and topped up daily.
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
                    <button type="submit" disabled={busy}
                        className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50">
                        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Add schedule
                    </button>
                </div>
            </form>

            {status === 'draft' ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4 dark:border-white/10">
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                        {ready
                            ? 'Ready: publishing puts this course on the storefront with bookable tee times.'
                            : 'Add at least one schedule to publish this course.'}
                    </p>
                    <button type="button" onClick={() => void publish()} disabled={!ready || busy}
                        className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50">
                        Publish
                    </button>
                </div>
            ) : (
                <p className="text-sm text-emerald-700 dark:text-emerald-400">Published: customers can book this course.</p>
            )}
        </div>
    );
}
```

- [ ] **Step 5: Courses screen** — in `GolfCoursesClient.tsx`:

The types import becomes `import type { AdminGolfCourse, AdminCoursePage } from '@/lib/server/golf/courses';` and `GolfCourse` stays imported for `editing`.

Replace the `scheduling` state with:
```ts
    /** The course whose tee times are open, and whether it was opened from Publish. */
    const [scheduling, setScheduling] = useState<{ course: AdminGolfCourse; fromPublish: boolean } | null>(null);
```

Header row: after `<th className="px-4 py-2 font-medium">Status</th>` add `<th className="px-4 py-2 font-medium">Booking</th>`; the empty-state `colSpan={6}` becomes `colSpan={7}`; the table's `min-w-[720px]` becomes `min-w-[820px]`.

After the Status cell, add:
```tsx
                                <td className="px-4 py-2">
                                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${course.bookable
                                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                                        : 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'}`}>
                                        {course.bookable ? 'Bookable' : 'Needs tee times'}
                                    </span>
                                </td>
```

The Tee times button's `onClick` becomes `() => setScheduling({ course, fromPublish: false })`.

The publish/unpublish button's `onClick` becomes:
```tsx
                                                    onClick={() => {
                                                        // Published means bookable: send the admin to what is missing instead.
                                                        if (course.status === 'draft' && !course.bookable) {
                                                            setScheduling({ course, fromPublish: true });
                                                            return;
                                                        }
                                                        void act(
                                                            { action: course.status === 'published' ? 'unpublish' : 'publish', id: course.id },
                                                            course.status === 'published' ? 'Course unpublished' : 'Course published',
                                                        );
                                                    }}
```

The Tee times dialog becomes:
```tsx
            <Dialog open={scheduling !== null} onOpenChange={open => { if (!open) setScheduling(null); }}>
                <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>Tee times · {scheduling?.course.name}</DialogTitle>
                    </DialogHeader>
                    {scheduling && (
                        <TeeTimeSchedules key={scheduling.course.id} course={scheduling.course}
                            publishHint={scheduling.fromPublish} onChanged={() => router.refresh()} />
                    )}
                </DialogContent>
            </Dialog>
```

- [ ] **Step 6: Run, expect PASS** — `npx vitest run "src/app/admin/(dashboard)/golf"` and `npx tsc --noEmit -p .`

- [ ] **Step 7: Commit** — `git add "src/app/admin/(dashboard)/golf" && git commit -m "feat(golf): admin shows which courses are bookable and guides publishing through tee times"`

---

### Task 5: Demo courses and live check

- [ ] **Step 1: Time zones and schedules** (local database only):

```bash
docker exec -i cheapest-go-app-postgres-1 sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
UPDATE golf_courses SET updated_at = now(), timezone = CASE slug
    WHEN 'demo-wack-wack-east-manila'     THEN 'Asia/Manila'
    WHEN 'demo-taiheiyo-gotemba-shizuoka' THEN 'Asia/Tokyo'
    WHEN 'demo-jack-nicklaus-incheon'     THEN 'Asia/Seoul'
    WHEN 'demo-mission-hills-shenzhen'    THEN 'Asia/Shanghai' END
 WHERE slug LIKE 'demo-%' AND timezone IS NULL;
INSERT INTO golf_tee_time_schedules (course_id, name, days_of_week, first_tee, last_tee, interval_minutes, spots, price_per_player)
SELECT c.id, 'Daily', '{0,1,2,3,4,5,6}', '06:00', '15:00', 10, 4, c.green_fee_from
  FROM golf_courses c
 WHERE c.slug LIKE 'demo-%' AND c.timezone IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM golf_tee_time_schedules s WHERE s.course_id = c.id);
SQL
```
Expected: `UPDATE 4`, `INSERT 0 4`.

- [ ] **Step 2: Tee times from the real generator** — `curl -s -H "Authorization: Bearer $CRON_SECRET" http://localhost:3001/api/cron/golf-generate-tee-times` → `{"success":true,"created":<about 13,000>}`.

- [ ] **Step 3: Live check** — each demo course page on :3001 renders the booking panel (`id="golf-date"`), and tomorrow's availability lists 55 tee times at the course's price.
