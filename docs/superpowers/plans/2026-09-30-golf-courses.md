# Golf Course Listings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin-curated golf course catalogue: admin CRUD at `/admin/golf`, public `/golf` list and `/golf/[slug]` detail with an "Ask about tee times" button that opens the support chat.

**Architecture:** One `golf_courses` table (dbmate migration). Client-safe types, zod schema and `slugify` in `src/lib/schemas/golf.ts`. All SQL in `src/lib/server/golf/courses.ts` (postgres.js tagged templates via `getSqlAdmin()`); "published only" is decided there. A thin admin API route mirrors `api/admin/destinations`. Storefront components in `src/components/golf/`.

**Tech Stack:** Next.js 15 App Router, postgres.js, zod 4, next-intl 4, zustand, Tailwind 4, vitest + Testing Library (happy-dom).

Spec: `docs/superpowers/specs/2026-09-30-golf-courses-design.md`.

**Working directory for every command:** `c:\Users\USER\Documents\GitHub\cheapest-go-app-golf` (worktree, branch `feat/golf-courses`).

---

## File map

| File | Responsibility |
|---|---|
| `db/migrations/20260930000001_golf_courses.sql` | table + constraints + index |
| `src/lib/schemas/golf.ts` | amenity/holes vocab, `GolfCourse` type, `golfCourseInputSchema`, `slugify` (client-safe) |
| `src/lib/server/golf/errors.ts` | `SlugTakenError` (no DB import, so tests can mock the module) |
| `src/lib/server/golf/courses.ts` | every query |
| `src/app/api/admin/golf-courses/route.ts` | admin GET/POST |
| `src/app/admin/(dashboard)/golf/{page.tsx,GolfCoursesClient.tsx,GolfCourseForm.tsx}` | admin screen |
| `src/components/admin/Sidebar.tsx` | nav entry |
| `src/components/golf/{format.ts,GolfCourseCard.tsx,TeeTimeButton.tsx}` | storefront pieces |
| `src/app/(main)/golf/{page.tsx,[slug]/page.tsx}` | storefront pages |
| `src/locales/{en,ja,ko,zh}.json` | `golf` namespace |
| `CONTEXT.md` | glossary entry |

---

### Task 0: Worktree can run tests

- [ ] **Step 1:** Link dependencies and env from the main checkout (gitignored, not committed):

```powershell
New-Item -ItemType Junction -Path node_modules -Target ..\cheapest-go-app\node_modules
Copy-Item ..\cheapest-go-app\.env .env
```

- [ ] **Step 2:** Sanity run: `npx vitest run src/locales/locales.test.ts` → PASS.

---

### Task 1: Migration

**Files:** Create `db/migrations/20260930000001_golf_courses.sql`

- [ ] **Step 1: Write the migration**

```sql
-- migrate:up
-- Golf courses CheapestGo can arrange play at (CONTEXT.md, "Golf Course"). Curated by the
-- team in the admin; there is no supplier behind this table. `green_fee_from` is an
-- indicative "from" price for the listing, never a quote.
CREATE TABLE IF NOT EXISTS public.golf_courses (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug            text NOT NULL,
    name            text NOT NULL,
    country         text NOT NULL,
    city            text NOT NULL,
    address         text,
    description     text NOT NULL DEFAULT '',
    holes           integer NOT NULL,
    par             integer,
    green_fee_from  numeric(10,2),
    currency        char(3) NOT NULL DEFAULT 'USD',
    image_urls      text[] NOT NULL DEFAULT '{}',
    amenities       text[] NOT NULL DEFAULT '{}',
    -- Open vocabulary (CONTEXT.md, "Enum field"): a CHECK swap is cheaper than a native enum.
    status          text NOT NULL DEFAULT 'draft',
    created_at      timestamp with time zone NOT NULL DEFAULT now(),
    updated_at      timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT golf_courses_slug_key UNIQUE (slug),
    CONSTRAINT golf_courses_slug_format_check CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    CONSTRAINT golf_courses_holes_check CHECK (holes IN (9, 18, 27, 36)),
    CONSTRAINT golf_courses_par_check CHECK (par IS NULL OR par BETWEEN 27 AND 144),
    CONSTRAINT golf_courses_green_fee_check CHECK (green_fee_from IS NULL OR green_fee_from >= 0),
    CONSTRAINT golf_courses_status_check CHECK (status IN ('draft', 'published'))
);

CREATE INDEX IF NOT EXISTS idx_golf_courses_status_country
    ON public.golf_courses (status, country);

-- migrate:down
DROP TABLE IF EXISTS public.golf_courses;
```

- [ ] **Step 2: Apply locally** (the local DB has unrelated pending migrations, so apply this file directly rather than `dbmate up`):

```bash
sed -n '/-- migrate:up/,/-- migrate:down/p' db/migrations/20260930000001_golf_courses.sql \
  | docker exec -i cheapest-go-app-postgres-1 sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```
Expected: `CREATE TABLE`, `CREATE INDEX`.

- [ ] **Step 3: Commit** — `git add db/migrations/20260930000001_golf_courses.sql && git commit -m "feat(golf): golf_courses table"`

---

### Task 2: Schema, types, slugify

**Files:** Create `src/lib/schemas/golf.ts`, Test `src/lib/schemas/golf.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from 'vitest';
import { golfCourseInputSchema, slugify } from './golf';

const valid = { name: 'Wack Wack East', country: 'Philippines', city: 'Mandaluyong', holes: 18 };

describe('slugify', () => {
    it('joins parts, strips accents and punctuation', () => {
        expect(slugify('Club de Golf Alcanada', 'Alcúdia')).toBe('club-de-golf-alcanada-alcudia');
        expect(slugify('  St. Andrews — Old Course ')).toBe('st-andrews-old-course');
    });
    it('is empty for text with no latin letters or digits', () => {
        expect(slugify('남서울')).toBe('');
    });
});

describe('golfCourseInputSchema', () => {
    it('fills defaults and generates the slug from name and city', () => {
        const out = golfCourseInputSchema.parse(valid);
        expect(out).toMatchObject({
            slug: 'wack-wack-east-mandaluyong', address: null, description: '', par: null,
            greenFeeFrom: null, currency: 'USD', imageUrls: [], amenities: [],
        });
    });
    it('normalises a slug the admin typed', () => {
        expect(golfCourseInputSchema.parse({ ...valid, slug: 'My Course!' }).slug).toBe('my-course');
    });
    it('asks for a slug when none can be generated', () => {
        const r = golfCourseInputSchema.safeParse({ ...valid, name: '남서울', city: '성남' });
        expect(r.success).toBe(false);
        expect(r.error?.issues[0].path).toEqual(['slug']);
    });
    it('rejects holes outside 9/18/27/36, non-https images and unknown amenities', () => {
        expect(golfCourseInputSchema.safeParse({ ...valid, holes: 12 }).success).toBe(false);
        expect(golfCourseInputSchema.safeParse({ ...valid, imageUrls: ['http://x.com/a.jpg'] }).success).toBe(false);
        expect(golfCourseInputSchema.safeParse({ ...valid, amenities: ['spa'] }).success).toBe(false);
    });
    it('uppercases currency and de-duplicates amenities', () => {
        const out = golfCourseInputSchema.parse({ ...valid, currency: 'php', amenities: ['cart', 'cart', 'caddie'] });
        expect(out.currency).toBe('PHP');
        expect(out.amenities).toEqual(['cart', 'caddie']);
    });
    it('requires name, country and city', () => {
        const r = golfCourseInputSchema.safeParse({ holes: 18, name: ' ', country: '', city: '' });
        expect(r.success).toBe(false);
        const paths = r.error!.issues.map(i => i.path[0]);
        expect(paths).toEqual(expect.arrayContaining(['name', 'country', 'city']));
    });
});
```

- [ ] **Step 2:** `npx vitest run src/lib/schemas/golf.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
import { z } from 'zod';

/**
 * Golf Course listings (CONTEXT.md, "Golf Course"). Client-safe: types, the input schema the
 * admin form and the API share, and the slug rule. Queries live in lib/server/golf/courses.
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
}

/** Lowercase a-z0-9 words joined by single hyphens; '' when nothing latin survives. */
export function slugify(...parts: string[]): string {
    return parts
        .join(' ')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
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
```

- [ ] **Step 4:** `npx vitest run src/lib/schemas/golf.test.ts` → PASS.
- [ ] **Step 5: Commit** — `feat(golf): course input schema and slugify`

---

### Task 3: Database module

**Files:** Create `src/lib/server/golf/errors.ts`, `src/lib/server/golf/courses.ts`; Test `src/lib/server/golf/courses.integration.test.ts`

- [ ] **Step 1: Failing integration test** (skips without a reachable DB, like `inbox.integration.test.ts`)

```ts
import { describe, it, expect, afterAll } from 'vitest';
import type { GolfCourseInput } from '@/lib/schemas/golf';
import {
    createCourse, updateCourse, setCourseStatus, deleteCourses,
    getPublishedCourseBySlug, listPublishedCourses, listPublishedCountries, listCoursesForAdmin,
} from './courses';
import { SlugTakenError } from './errors';

async function databaseReachable(): Promise<boolean> {
    if (!process.env.DATABASE_URL) return false;
    try {
        const { getSqlAdmin } = await import('@/lib/db/postgres');
        await getSqlAdmin()`SELECT 1 FROM golf_courses LIMIT 1`;
        return true;
    } catch {
        return false;
    }
}

const reachable = await databaseReachable();
const run = crypto.randomUUID().slice(0, 8);
const created: string[] = [];

function input(over: Partial<GolfCourseInput> = {}): GolfCourseInput {
    return {
        name: 'Test Course', country: `Testland-${run}`, city: 'Testville', slug: `golf-test-${run}-${created.length}`,
        address: null, description: '', holes: 18, par: 72, greenFeeFrom: 85, currency: 'USD',
        imageUrls: [], amenities: ['cart'], ...over,
    };
}

async function make(over: Partial<GolfCourseInput> = {}, publish = false) {
    const course = await createCourse(input(over));
    created.push(course.id);
    if (publish) await setCourseStatus(course.id, 'published');
    return course;
}

describe.skipIf(!reachable)('golf courses', () => {
    afterAll(async () => { if (created.length) await deleteCourses(created); });

    it('keeps drafts off the storefront', async () => {
        const draft = await make();
        expect(draft.status).toBe('draft');
        expect(await getPublishedCourseBySlug(draft.slug)).toBeNull();
        expect((await listPublishedCourses({ country: draft.country })).map(c => c.id)).not.toContain(draft.id);
    });

    it('shows a published course, filtered by country, with numbers as numbers', async () => {
        const course = await make({}, true);
        const found = await getPublishedCourseBySlug(course.slug);
        expect(found).toMatchObject({ id: course.id, greenFeeFrom: 85, amenities: ['cart'] });
        expect((await listPublishedCourses({ country: course.country })).map(c => c.id)).toContain(course.id);
        expect(await listPublishedCountries()).toContain(course.country);
    });

    it('refuses a slug another course has', async () => {
        const first = await make();
        await expect(createCourse(input({ slug: first.slug }))).rejects.toBeInstanceOf(SlugTakenError);
    });

    it('updates, and reports an unknown id as null', async () => {
        const course = await make();
        const updated = await updateCourse(course.id, input({ slug: course.slug, name: 'Renamed' }));
        expect(updated?.name).toBe('Renamed');
        expect(await updateCourse(crypto.randomUUID(), input())).toBeNull();
    });

    it('finds courses for the admin by name, city or country, drafts included', async () => {
        const course = await make({ name: `Findable ${run}` });
        const result = await listCoursesForAdmin({ q: `Findable ${run}`, page: 1 });
        expect(result.courses.map(c => c.id)).toEqual([course.id]);
        expect(result.total).toBe(1);
    });
});
```

- [ ] **Step 2:** `DATABASE_URL=postgresql://…@localhost:5433/cheapestgo npx vitest run src/lib/server/golf` (URL from `.env`) → FAIL (module not found).

- [ ] **Step 3: Implement `errors.ts`**

```ts
/** Another course already uses this slug. Kept apart from courses.ts so tests can mock that module. */
export class SlugTakenError extends Error {
    constructor(public readonly slug: string) {
        super(`The slug "${slug}" is already used by another course`);
        this.name = 'SlugTakenError';
    }
}
```

- [ ] **Step 4: Implement `courses.ts`**

```ts
import type postgres from 'postgres';
import { getSqlAdmin } from '@/lib/db/postgres';
import type { GolfCourse, GolfCourseInput, GolfCourseStatus } from '@/lib/schemas/golf';
import { SlugTakenError } from './errors';

/**
 * Every query about Golf Courses (CONTEXT.md, "Golf Course").
 *
 * "Published only" is decided here, in the public readers, and nowhere else — a page that
 * forgot the filter would put a half-written draft on the storefront.
 */

export const ADMIN_PAGE_SIZE = 20;

function columns(sql: postgres.Sql) {
    return sql`
        id, slug, name, country, city, address, description, holes, par,
        green_fee_from::float8 AS "greenFeeFrom", currency, image_urls AS "imageUrls",
        amenities, status
    `;
}

/** postgres.js returns a RowList; plain objects cross the server/client boundary cleanly. */
function plain(rows: readonly GolfCourse[]): GolfCourse[] {
    return rows.map(row => ({ ...row, currency: row.currency.trim() }));
}

function isSlugConflict(err: unknown): boolean {
    const e = err as { code?: string; constraint_name?: string };
    return e?.code === '23505' && e.constraint_name === 'golf_courses_slug_key';
}

export async function listPublishedCourses({ country }: { country?: string } = {}): Promise<GolfCourse[]> {
    const sql = getSqlAdmin();
    const rows = await sql<GolfCourse[]>`
        SELECT ${columns(sql)} FROM golf_courses
         WHERE status = 'published' ${country ? sql`AND country = ${country}` : sql``}
         ORDER BY name`;
    return plain(rows);
}

export async function listPublishedCountries(): Promise<string[]> {
    const sql = getSqlAdmin();
    const rows = await sql<{ country: string }[]>`
        SELECT DISTINCT country FROM golf_courses WHERE status = 'published' ORDER BY country`;
    return rows.map(r => r.country);
}

export async function getPublishedCourseBySlug(slug: string): Promise<GolfCourse | null> {
    const sql = getSqlAdmin();
    const rows = await sql<GolfCourse[]>`
        SELECT ${columns(sql)} FROM golf_courses WHERE slug = ${slug} AND status = 'published'`;
    return plain(rows)[0] ?? null;
}

export interface AdminCoursePage {
    courses: GolfCourse[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

export async function listCoursesForAdmin({ q = '', page = 1 }: { q?: string; page?: number }): Promise<AdminCoursePage> {
    const sql = getSqlAdmin();
    const current = Math.max(1, Math.floor(page) || 1);
    const term = q.trim();
    const like = `%${term.replace(/[\\%_]/g, '\\$&')}%`;
    const where = term
        ? sql`WHERE name ILIKE ${like} OR city ILIKE ${like} OR country ILIKE ${like}`
        : sql``;

    const [rows, [{ count }]] = await Promise.all([
        sql<GolfCourse[]>`
            SELECT ${columns(sql)} FROM golf_courses ${where}
             ORDER BY updated_at DESC
             LIMIT ${ADMIN_PAGE_SIZE} OFFSET ${(current - 1) * ADMIN_PAGE_SIZE}`,
        sql<{ count: number }[]>`SELECT count(*)::int AS count FROM golf_courses ${where}`,
    ]);

    return {
        courses: plain(rows),
        total: count,
        page: current,
        pageSize: ADMIN_PAGE_SIZE,
        totalPages: Math.max(1, Math.ceil(count / ADMIN_PAGE_SIZE)),
    };
}

export async function createCourse(input: GolfCourseInput): Promise<GolfCourse> {
    const sql = getSqlAdmin();
    try {
        const rows = await sql<GolfCourse[]>`
            INSERT INTO golf_courses
                (slug, name, country, city, address, description, holes, par,
                 green_fee_from, currency, image_urls, amenities)
            VALUES
                (${input.slug}, ${input.name}, ${input.country}, ${input.city}, ${input.address},
                 ${input.description}, ${input.holes}, ${input.par}, ${input.greenFeeFrom},
                 ${input.currency}, ${input.imageUrls}::text[], ${input.amenities}::text[])
            RETURNING ${columns(sql)}`;
        return plain(rows)[0];
    } catch (err) {
        if (isSlugConflict(err)) throw new SlugTakenError(input.slug);
        throw err;
    }
}

/** null when no course has this id. */
export async function updateCourse(id: string, input: GolfCourseInput): Promise<GolfCourse | null> {
    const sql = getSqlAdmin();
    try {
        const rows = await sql<GolfCourse[]>`
            UPDATE golf_courses SET
                slug = ${input.slug}, name = ${input.name}, country = ${input.country},
                city = ${input.city}, address = ${input.address}, description = ${input.description},
                holes = ${input.holes}, par = ${input.par}, green_fee_from = ${input.greenFeeFrom},
                currency = ${input.currency}, image_urls = ${input.imageUrls}::text[],
                amenities = ${input.amenities}::text[], updated_at = now()
             WHERE id = ${id}
            RETURNING ${columns(sql)}`;
        return plain(rows)[0] ?? null;
    } catch (err) {
        if (isSlugConflict(err)) throw new SlugTakenError(input.slug);
        throw err;
    }
}

/** false when no course has this id. */
export async function setCourseStatus(id: string, status: GolfCourseStatus): Promise<boolean> {
    const sql = getSqlAdmin();
    const rows = await sql`
        UPDATE golf_courses SET status = ${status}, updated_at = now() WHERE id = ${id} RETURNING id`;
    return rows.length > 0;
}

/** How many were deleted. */
export async function deleteCourses(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const sql = getSqlAdmin();
    const rows = await sql`DELETE FROM golf_courses WHERE id IN ${sql(ids)} RETURNING id`;
    return rows.length;
}
```

- [ ] **Step 5:** Re-run the Step 2 command → PASS (5 tests).
- [ ] **Step 6: Commit** — `feat(golf): database module`

---

### Task 4: Admin API route

**Files:** Create `src/app/api/admin/golf-courses/route.ts`; Test `src/app/api/admin/golf-courses/route.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

const auth = vi.hoisted(() => ({ result: { user: { id: 'admin-1', email: 'a@x.com' } } as unknown }));

vi.mock('@/lib/server/admin', () => ({
    requireAdmin: vi.fn(async () => auth.result),
    isAuthError: (r: unknown) => r instanceof Response,
}));
vi.mock('@/lib/server/rate-limit', () => ({ rateLimit: vi.fn(async () => ({ success: true })) }));
vi.mock('@/lib/server/admin/audit', () => ({ logAdminAction: vi.fn() }));
vi.mock('@/lib/server/golf/courses', () => ({
    listCoursesForAdmin: vi.fn(async () => ({ courses: [], total: 0, page: 1, pageSize: 20, totalPages: 1 })),
    createCourse: vi.fn(async (input: { slug: string }) => ({ id: 'c1', status: 'draft', ...input })),
    updateCourse: vi.fn(async () => null),
    setCourseStatus: vi.fn(async () => true),
    deleteCourses: vi.fn(async (ids: string[]) => ids.length),
}));

import { GET, POST } from './route';
import { createCourse } from '@/lib/server/golf/courses';
import { SlugTakenError } from '@/lib/server/golf/errors';

const post = (body: unknown) =>
    POST(new Request('http://localhost/api/admin/golf-courses', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }) as never);

const course = { name: 'Wack Wack', country: 'Philippines', city: 'Manila', holes: 18 };

beforeEach(() => { auth.result = { user: { id: 'admin-1', email: 'a@x.com' } }; });

describe('/api/admin/golf-courses', () => {
    it('refuses anyone who is not an admin', async () => {
        auth.result = NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        const res = await GET(new Request('http://localhost/api/admin/golf-courses') as never);
        expect(res.status).toBe(403);
    });

    it('creates a course from valid input', async () => {
        const res = await post({ action: 'create', course });
        expect(res.status).toBe(201);
        expect(createCourse).toHaveBeenCalledWith(expect.objectContaining({ slug: 'wack-wack-manila', holes: 18 }));
    });

    it('answers invalid input with errors per field', async () => {
        const res = await post({ action: 'create', course: { ...course, holes: 12 } });
        expect(res.status).toBe(400);
        expect((await res.json()).fieldErrors.holes).toBeDefined();
    });

    it('answers a taken slug with 409 on the slug field', async () => {
        vi.mocked(createCourse).mockRejectedValueOnce(new SlugTakenError('wack-wack-manila'));
        const res = await post({ action: 'create', course });
        expect(res.status).toBe(409);
        expect((await res.json()).fieldErrors.slug).toBeDefined();
    });

    it('answers an update to an unknown course with 404', async () => {
        const res = await post({ action: 'update', id: crypto.randomUUID(), course });
        expect(res.status).toBe(404);
    });

    it('rejects an unknown action', async () => {
        expect((await post({ action: 'explode' })).status).toBe(400);
    });
});
```

- [ ] **Step 2:** `npx vitest run src/app/api/admin/golf-courses` → FAIL.

- [ ] **Step 3: Implement**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin, isAuthError } from '@/lib/server/admin';
import { rateLimit } from '@/lib/server/rate-limit';
import { logAdminAction } from '@/lib/server/admin/audit';
import { golfCourseInputSchema } from '@/lib/schemas/golf';
import {
    listCoursesForAdmin, createCourse, updateCourse, setCourseStatus, deleteCourses,
} from '@/lib/server/golf/courses';
import { SlugTakenError } from '@/lib/server/golf/errors';

export const dynamic = 'force-dynamic';

/** Admin management of Golf Courses. Same shape as api/admin/destinations. */

const idSchema = z.string().uuid();

function fail(status: number, error: string, fieldErrors?: Record<string, string[] | undefined>) {
    return NextResponse.json({ success: false, error, ...(fieldErrors ? { fieldErrors } : {}) }, { status });
}

export async function GET(req: NextRequest) {
    const rl = await rateLimit(req, { limit: 30, windowMs: 60_000, prefix: 'admin-golf' });
    if (!rl.success) return fail(429, 'Too many requests');

    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    const { searchParams } = new URL(req.url);
    const result = await listCoursesForAdmin({
        q: searchParams.get('q') ?? '',
        page: parseInt(searchParams.get('page') ?? '1', 10),
    });
    const { courses, ...paging } = result;
    return NextResponse.json({ success: true, data: courses, ...paging });
}

export async function POST(req: NextRequest) {
    const rl = await rateLimit(req, { limit: 20, windowMs: 60_000, prefix: 'admin-golf-post' });
    if (!rl.success) return fail(429, 'Too many requests');

    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return fail(400, 'Invalid JSON');
    const { action } = body;
    const who = { adminId: auth.user.id, adminEmail: auth.user.email };

    try {
        if (action === 'create' || action === 'update') {
            const parsed = golfCourseInputSchema.safeParse(body.course);
            if (!parsed.success) {
                return fail(400, 'Some fields need attention', z.flattenError(parsed.error).fieldErrors);
            }

            if (action === 'create') {
                const course = await createCourse(parsed.data);
                logAdminAction({ action: 'create_golf_course', ...who, targetId: course.id, details: { slug: course.slug } });
                return NextResponse.json({ success: true, data: course }, { status: 201 });
            }

            const id = idSchema.safeParse(body.id);
            if (!id.success) return fail(400, 'id is required');
            const course = await updateCourse(id.data, parsed.data);
            if (!course) return fail(404, 'Course not found');
            logAdminAction({ action: 'update_golf_course', ...who, targetId: course.id, details: { slug: course.slug } });
            return NextResponse.json({ success: true, data: course });
        }

        if (action === 'publish' || action === 'unpublish') {
            const id = idSchema.safeParse(body.id);
            if (!id.success) return fail(400, 'id is required');
            const found = await setCourseStatus(id.data, action === 'publish' ? 'published' : 'draft');
            if (!found) return fail(404, 'Course not found');
            logAdminAction({ action: `${action}_golf_course`, ...who, targetId: id.data });
            return NextResponse.json({ success: true });
        }

        if (action === 'delete') {
            const ids = z.array(idSchema).min(1).safeParse(body.ids ?? (body.id ? [body.id] : []));
            if (!ids.success) return fail(400, 'id or ids required');
            const deleted = await deleteCourses(ids.data);
            logAdminAction({ action: 'delete_golf_course', ...who, details: { ids: ids.data } });
            return NextResponse.json({ success: true, deleted });
        }
    } catch (err) {
        if (err instanceof SlugTakenError) {
            return fail(409, err.message, { slug: ['Another course already uses this slug'] });
        }
        throw err;
    }

    return fail(400, `Unknown action: ${String(action)}`);
}
```

- [ ] **Step 4:** Re-run → PASS (6 tests).
- [ ] **Step 5: Commit** — `feat(golf): admin API`

---

### Task 5: Admin form

**Files:** Create `src/app/admin/(dashboard)/golf/GolfCourseForm.tsx`; Test `.../golf/GolfCourseForm.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GolfCourseForm } from './GolfCourseForm';

const type = (label: RegExp, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('GolfCourseForm', () => {
    it('fills the slug from name and city until the admin edits it', () => {
        render(<GolfCourseForm onSubmit={vi.fn()} onCancel={vi.fn()} />);
        type(/^name/i, 'Wack Wack East');
        type(/^city/i, 'Manila');
        expect(screen.getByLabelText(/^slug/i)).toHaveValue('wack-wack-east-manila');

        type(/^slug/i, 'wack-east');
        type(/^name/i, 'Wack Wack West');
        expect(screen.getByLabelText(/^slug/i)).toHaveValue('wack-east');
    });

    it('sends numbers as numbers, one image per line and the ticked amenities', async () => {
        const onSubmit = vi.fn(async () => undefined);
        render(<GolfCourseForm onSubmit={onSubmit} onCancel={vi.fn()} />);
        type(/^name/i, 'Wack Wack');
        type(/^country/i, 'Philippines');
        type(/^city/i, 'Manila');
        type(/^par/i, '72');
        type(/green fee from/i, '');
        type(/image urls/i, 'https://a.test/1.jpg\n\n https://a.test/2.jpg ');
        fireEvent.click(screen.getByLabelText('Caddie'));
        fireEvent.click(screen.getByRole('button', { name: /save/i }));

        await waitFor(() => expect(onSubmit).toHaveBeenCalled());
        expect(onSubmit.mock.calls[0][0]).toMatchObject({
            name: 'Wack Wack', holes: 18, par: 72, greenFeeFrom: null,
            imageUrls: ['https://a.test/1.jpg', 'https://a.test/2.jpg'], amenities: ['caddie'],
            slug: 'wack-wack-manila',
        });
    });

    it('shows the errors the server returned beside their fields', async () => {
        render(<GolfCourseForm onSubmit={async () => ({ fieldErrors: { slug: ['Another course already uses this slug'] } })} onCancel={vi.fn()} />);
        type(/^name/i, 'X');
        fireEvent.click(screen.getByRole('button', { name: /save/i }));
        expect(await screen.findByText('Another course already uses this slug')).toBeInTheDocument();
    });
});
```

- [ ] **Step 2:** `npx vitest run "src/app/admin/(dashboard)/golf"` → FAIL.

- [ ] **Step 3: Implement**

```tsx
'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
    GOLF_AMENITIES, GOLF_HOLES, slugify,
    type GolfAmenity, type GolfCourse, type GolfCourseInputRaw,
} from '@/lib/schemas/golf';

export type FieldErrors = Partial<Record<string, string[]>>;

/** Admin-only, so English (CONTEXT.md, "Interface Language"). */
export const AMENITY_LABELS: Record<GolfAmenity, string> = {
    caddie: 'Caddie', cart: 'Golf cart', driving_range: 'Driving range', putting_green: 'Putting green',
    clubhouse: 'Clubhouse', restaurant: 'Restaurant', club_rental: 'Club rental', pro_shop: 'Pro shop',
    lessons: 'Lessons', night_golf: 'Night golf',
};

const inputClass =
    'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5';

/** '' → null, otherwise a number (NaN is left for the server to refuse). */
const toNumber = (value: string) => (value.trim() === '' ? null : Number(value));

export function GolfCourseForm({
    initial,
    onSubmit,
    onCancel,
}: {
    initial?: GolfCourse;
    /** Resolves with field errors to show, or nothing when saved. */
    onSubmit: (course: GolfCourseInputRaw) => Promise<{ fieldErrors?: FieldErrors } | void>;
    onCancel: () => void;
}) {
    const [name, setName] = useState(initial?.name ?? '');
    const [country, setCountry] = useState(initial?.country ?? '');
    const [city, setCity] = useState(initial?.city ?? '');
    // An existing course keeps its slug: changing it breaks every link already shared.
    const [slug, setSlug] = useState(initial?.slug ?? '');
    const [slugTouched, setSlugTouched] = useState(Boolean(initial));
    const [address, setAddress] = useState(initial?.address ?? '');
    const [holes, setHoles] = useState(String(initial?.holes ?? 18));
    const [par, setPar] = useState(initial?.par != null ? String(initial.par) : '');
    const [greenFee, setGreenFee] = useState(initial?.greenFeeFrom != null ? String(initial.greenFeeFrom) : '');
    const [currency, setCurrency] = useState(initial?.currency ?? 'USD');
    const [images, setImages] = useState((initial?.imageUrls ?? []).join('\n'));
    const [amenities, setAmenities] = useState<GolfAmenity[]>(initial?.amenities ?? []);
    const [description, setDescription] = useState(initial?.description ?? '');
    const [errors, setErrors] = useState<FieldErrors>({});
    const [saving, setSaving] = useState(false);

    const shownSlug = slugTouched ? slug : slugify(name, city);

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setSaving(true);
        setErrors({});
        try {
            const result = await onSubmit({
                name, country, city, slug: shownSlug, address, description,
                holes: Number(holes), par: toNumber(par), greenFeeFrom: toNumber(greenFee), currency,
                imageUrls: images.split('\n').map(line => line.trim()).filter(Boolean),
                amenities,
            });
            if (result?.fieldErrors) setErrors(result.fieldErrors);
        } finally {
            setSaving(false);
        }
    };

    const error = (field: string) =>
        errors[field]?.[0] ? <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors[field]![0]}</p> : null;

    const field = (id: string, label: string, control: React.ReactNode, hint?: string) => (
        <div>
            <label htmlFor={id} className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">{label}</label>
            {control}
            {hint && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
            {error(id)}
        </div>
    );

    return (
        <form onSubmit={submit} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
                {field('name', 'Name', <input id="name" className={inputClass} value={name} onChange={e => setName(e.target.value)} />)}
                {field('slug', 'Slug', (
                    <input id="slug" className={`${inputClass} font-mono`} value={shownSlug}
                        onChange={e => { setSlugTouched(true); setSlug(e.target.value); }} />
                ), 'The course page address: /golf/<slug>')}
                {field('country', 'Country', <input id="country" className={inputClass} value={country} onChange={e => setCountry(e.target.value)} />)}
                {field('city', 'City', <input id="city" className={inputClass} value={city} onChange={e => setCity(e.target.value)} />)}
            </div>

            {field('address', 'Address', <input id="address" className={inputClass} value={address} onChange={e => setAddress(e.target.value)} />)}

            <div className="grid gap-4 sm:grid-cols-4">
                {field('holes', 'Holes', (
                    <select id="holes" className={inputClass} value={holes} onChange={e => setHoles(e.target.value)}>
                        {GOLF_HOLES.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                ))}
                {field('par', 'Par', <input id="par" type="number" inputMode="numeric" className={inputClass} value={par} onChange={e => setPar(e.target.value)} />)}
                {field('greenFeeFrom', 'Green fee from', <input id="greenFeeFrom" type="number" min="0" step="0.01" className={inputClass} value={greenFee} onChange={e => setGreenFee(e.target.value)} />, 'Indicative, not a quote')}
                {field('currency', 'Currency', <input id="currency" maxLength={3} className={`${inputClass} uppercase`} value={currency} onChange={e => setCurrency(e.target.value)} />)}
            </div>

            <fieldset>
                <legend className="mb-1 text-xs font-medium text-slate-600 dark:text-slate-300">Amenities</legend>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                    {GOLF_AMENITIES.map(code => (
                        <label key={code} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                            <input type="checkbox" checked={amenities.includes(code)}
                                onChange={e => setAmenities(current => e.target.checked ? [...current, code] : current.filter(a => a !== code))} />
                            {AMENITY_LABELS[code]}
                        </label>
                    ))}
                </div>
                {error('amenities')}
            </fieldset>

            {field('imageUrls', 'Image URLs', (
                <textarea id="imageUrls" rows={3} className={`${inputClass} font-mono text-xs`} value={images} onChange={e => setImages(e.target.value)} />
            ), 'One https:// URL per line. The first is the cover.')}

            {field('description', 'Description', (
                <textarea id="description" rows={6} className={inputClass} value={description} onChange={e => setDescription(e.target.value)} />
            ), 'Plain text. Leave a blank line between paragraphs.')}

            <div className="flex justify-end gap-2">
                <button type="button" onClick={onCancel} className="rounded-lg border border-slate-200 px-4 py-2 text-sm dark:border-white/10">Cancel</button>
                <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50">
                    {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
                </button>
            </div>
        </form>
    );
}
```

Note: labels are "Name", "Slug", "Country", "City", "Par", "Green fee from", "Image URLs" — test regexes anchor on these.

- [ ] **Step 4:** Re-run → PASS (3 tests).
- [ ] **Step 5: Commit** — `feat(golf): admin course form`

---

### Task 6: Admin screen + sidebar

**Files:** Create `src/app/admin/(dashboard)/golf/page.tsx`, `.../golf/GolfCoursesClient.tsx`; Modify `src/components/admin/Sidebar.tsx`

- [ ] **Step 1: `page.tsx`**

```tsx
import { listCoursesForAdmin } from '@/lib/server/golf/courses';
import { GolfCoursesClient } from './GolfCoursesClient';

export const dynamic = 'force-dynamic';

/** Golf Courses in the admin. The dashboard layout already refuses anyone who is not an admin. */
export default async function AdminGolfPage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const params = await searchParams;
    const q = typeof params.q === 'string' ? params.q : '';
    const page = typeof params.page === 'string' ? parseInt(params.page, 10) : 1;
    const data = await listCoursesForAdmin({ q, page });
    return <GolfCoursesClient data={data} q={q} />;
}
```

- [ ] **Step 2: `GolfCoursesClient.tsx`**

```tsx
'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Eye, EyeOff, Flag, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import type { GolfCourse, GolfCourseInputRaw } from '@/lib/schemas/golf';
import type { AdminCoursePage } from '@/lib/server/golf/courses';
import { GolfCourseForm, type FieldErrors } from './GolfCourseForm';

async function call(body: Record<string, unknown>) {
    const response = await fetch('/api/admin/golf-courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const json = await response.json().catch(() => ({}));
    return { ok: response.ok, json: json as { error?: string; fieldErrors?: FieldErrors } };
}

export function GolfCoursesClient({ data, q }: { data: AdminCoursePage; q: string }) {
    const router = useRouter();
    const [search, setSearch] = useState(q);
    /** null = closed, 'new' = creating, a course = editing it. */
    const [editing, setEditing] = useState<GolfCourse | 'new' | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

    const go = (params: { q?: string; page?: number }) => {
        const next = new URLSearchParams();
        if (params.q) next.set('q', params.q);
        if (params.page && params.page > 1) next.set('page', String(params.page));
        router.push(`/admin/golf${next.size ? `?${next}` : ''}`);
    };

    const save = async (course: GolfCourseInputRaw) => {
        const isNew = editing === 'new';
        const { ok, json } = await call(isNew
            ? { action: 'create', course }
            : { action: 'update', id: (editing as GolfCourse).id, course });
        if (!ok) {
            toast.error(json.error ?? 'Could not save the course');
            return { fieldErrors: json.fieldErrors };
        }
        toast.success(isNew ? 'Course created as a draft' : 'Course saved');
        setEditing(null);
        router.refresh();
    };

    const act = async (body: Record<string, unknown>, done: string) => {
        const { ok, json } = await call(body);
        if (!ok) { toast.error(json.error ?? 'Something went wrong'); return; }
        toast.success(done);
        router.refresh();
    };

    return (
        <div className="flex flex-col gap-4">
            <header className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
                        <Flag className="h-5 w-5" /> Golf Courses
                    </h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        Courses shown on /golf. New courses start as drafts; publish to put them on the storefront.
                    </p>
                </div>
                <button type="button" onClick={() => setEditing('new')}
                    className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500">
                    <Plus className="h-4 w-4" /> Add course
                </button>
            </header>

            <form onSubmit={e => { e.preventDefault(); go({ q: search.trim() }); }} className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, city or country"
                    aria-label="Search courses"
                    className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm dark:border-white/10 dark:bg-white/5" />
            </form>

            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10">
                <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-white/5 dark:text-slate-400">
                        <tr>
                            <th className="px-4 py-2 font-medium">Course</th>
                            <th className="px-4 py-2 font-medium">Location</th>
                            <th className="px-4 py-2 font-medium">Holes</th>
                            <th className="px-4 py-2 font-medium">From</th>
                            <th className="px-4 py-2 font-medium">Status</th>
                            <th className="px-4 py-2 text-right font-medium">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.courses.length === 0 && (
                            <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                                {q ? 'No courses match that search.' : 'No courses yet. Add the first one.'}
                            </td></tr>
                        )}
                        {data.courses.map(course => (
                            <tr key={course.id} className="border-t border-slate-100 dark:border-white/5">
                                <td className="px-4 py-2">
                                    <span className="flex items-center gap-3">
                                        <span className="relative h-10 w-14 shrink-0 overflow-hidden rounded-md bg-slate-100 dark:bg-white/10">
                                            {course.imageUrls[0] && <Image src={course.imageUrls[0]} alt="" fill unoptimized className="object-cover" />}
                                        </span>
                                        <span className="min-w-0">
                                            <span className="block truncate font-medium text-slate-900 dark:text-slate-100">{course.name}</span>
                                            <span className="block truncate font-mono text-xs text-slate-400">/golf/{course.slug}</span>
                                        </span>
                                    </span>
                                </td>
                                <td className="px-4 py-2 text-slate-600 dark:text-slate-300">{course.city}, {course.country}</td>
                                <td className="px-4 py-2 tabular-nums">{course.holes}{course.par ? ` · par ${course.par}` : ''}</td>
                                <td className="px-4 py-2 tabular-nums">{course.greenFeeFrom != null ? `${course.currency} ${course.greenFeeFrom}` : '—'}</td>
                                <td className="px-4 py-2">
                                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${course.status === 'published'
                                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                                        : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300'}`}>
                                        {course.status === 'published' ? 'Published' : 'Draft'}
                                    </span>
                                </td>
                                <td className="px-4 py-2">
                                    <span className="flex items-center justify-end gap-1">
                                        {confirmDelete === course.id ? (
                                            <>
                                                <span className="text-xs text-slate-500">Delete?</span>
                                                <button type="button" className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                                                    onClick={() => { setConfirmDelete(null); void act({ action: 'delete', id: course.id }, 'Course deleted'); }}>Yes</button>
                                                <button type="button" className="rounded px-2 py-1 text-xs hover:bg-slate-100 dark:hover:bg-white/10" onClick={() => setConfirmDelete(null)}>No</button>
                                            </>
                                        ) : (
                                            <>
                                                {course.status === 'published' && (
                                                    <Link href={`/golf/${course.slug}`} target="_blank" className="rounded px-2 py-1 text-xs text-blue-600 hover:underline">View</Link>
                                                )}
                                                <button type="button" aria-label={`Edit ${course.name}`} title="Edit" onClick={() => setEditing(course)}
                                                    className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"><Pencil className="h-4 w-4" /></button>
                                                <button type="button"
                                                    aria-label={course.status === 'published' ? `Unpublish ${course.name}` : `Publish ${course.name}`}
                                                    title={course.status === 'published' ? 'Unpublish' : 'Publish'}
                                                    onClick={() => void act(
                                                        { action: course.status === 'published' ? 'unpublish' : 'publish', id: course.id },
                                                        course.status === 'published' ? 'Course unpublished' : 'Course published',
                                                    )}
                                                    className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10">
                                                    {course.status === 'published' ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                                </button>
                                                <button type="button" aria-label={`Delete ${course.name}`} title="Delete" onClick={() => setConfirmDelete(course.id)}
                                                    className="rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"><Trash2 className="h-4 w-4" /></button>
                                            </>
                                        )}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {data.totalPages > 1 && (
                <nav className="flex items-center justify-end gap-2 text-sm" aria-label="Pages">
                    <button type="button" disabled={data.page <= 1} onClick={() => go({ q, page: data.page - 1 })}
                        className="rounded-lg border border-slate-200 px-3 py-1 disabled:opacity-40 dark:border-white/10">Previous</button>
                    <span className="text-slate-500">Page {data.page} of {data.totalPages}</span>
                    <button type="button" disabled={data.page >= data.totalPages} onClick={() => go({ q, page: data.page + 1 })}
                        className="rounded-lg border border-slate-200 px-3 py-1 disabled:opacity-40 dark:border-white/10">Next</button>
                </nav>
            )}

            <Dialog open={editing !== null} onOpenChange={open => { if (!open) setEditing(null); }}>
                <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{editing === 'new' ? 'Add golf course' : 'Edit golf course'}</DialogTitle>
                    </DialogHeader>
                    {editing !== null && (
                        <GolfCourseForm
                            key={editing === 'new' ? 'new' : editing.id}
                            initial={editing === 'new' ? undefined : editing}
                            onSubmit={save}
                            onCancel={() => setEditing(null)}
                        />
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
```

- [ ] **Step 3: Sidebar** — in `src/components/admin/Sidebar.tsx`, add `Flag,` to the lucide import list and, directly after the Destinations entry:

```tsx
            { label: 'Golf Courses', href: '/admin/golf', icon: Flag },
```

- [ ] **Step 4:** `npx tsc --noEmit -p .` → no errors.
- [ ] **Step 5: Commit** — `feat(golf): admin screen and sidebar entry`

---

### Task 7: Storefront copy

**Files:** Modify `src/locales/en.json`, `ja.json`, `ko.json`, `zh.json` — add a top-level `golf` object (keys identical in all four; placeholders `{holes}`, `{par}`, `{price}`, `{name}`, `{city}`, `{country}` kept verbatim).

- [ ] **Step 1: en**

```json
"golf": {
  "metaTitle": "Golf Courses & Tee Times",
  "metaDescription": "Browse golf courses we can arrange play at, and ask our team about tee times.",
  "heading": "Golf courses",
  "subheading": "Courses our team can arrange play at. Ask us about tee times and we'll confirm with the course.",
  "filterLabel": "Country",
  "allCountries": "All countries",
  "empty": "No golf courses are listed here yet. Check back soon.",
  "holes": "{holes} holes",
  "par": "Par {par}",
  "greenFeesFrom": "Green fees from {price}",
  "amenitiesHeading": "Facilities",
  "aboutHeading": "About the course",
  "addressHeading": "Address",
  "askTeeTimes": "Ask about tee times",
  "askTeeTimesHint": "Tell our team your date, number of players and preferred time. We'll check with the course and get back to you.",
  "backToList": "All golf courses",
  "courseTitle": "{name} – Golf in {city}, {country}",
  "amenities": {
    "caddie": "Caddie", "cart": "Golf cart", "driving_range": "Driving range", "putting_green": "Putting green",
    "clubhouse": "Clubhouse", "restaurant": "Restaurant", "club_rental": "Club rental", "pro_shop": "Pro shop",
    "lessons": "Lessons", "night_golf": "Night golf"
  }
}
```

- [ ] **Step 2: ja**

```json
"golf": {
  "metaTitle": "ゴルフ場とティータイム",
  "metaDescription": "手配可能なゴルフ場を探して、ティータイムについてチームにお問い合わせください。",
  "heading": "ゴルフ場",
  "subheading": "私たちのチームがプレーを手配できるゴルフ場です。ティータイムをお問い合わせいただければ、ゴルフ場に確認いたします。",
  "filterLabel": "国",
  "allCountries": "すべての国",
  "empty": "現在掲載中のゴルフ場はありません。しばらくしてから再度ご確認ください。",
  "holes": "{holes}ホール",
  "par": "パー{par}",
  "greenFeesFrom": "グリーンフィー {price}〜",
  "amenitiesHeading": "設備",
  "aboutHeading": "コースについて",
  "addressHeading": "住所",
  "askTeeTimes": "ティータイムを問い合わせる",
  "askTeeTimesHint": "ご希望の日付、人数、時間帯をお知らせください。ゴルフ場に確認してご連絡します。",
  "backToList": "すべてのゴルフ場",
  "courseTitle": "{name} – {city}（{country}）のゴルフ",
  "amenities": {
    "caddie": "キャディー", "cart": "ゴルフカート", "driving_range": "ドライビングレンジ", "putting_green": "パッティンググリーン",
    "clubhouse": "クラブハウス", "restaurant": "レストラン", "club_rental": "レンタルクラブ", "pro_shop": "プロショップ",
    "lessons": "レッスン", "night_golf": "ナイターゴルフ"
  }
}
```

- [ ] **Step 3: ko**

```json
"golf": {
  "metaTitle": "골프장 및 티타임",
  "metaDescription": "예약을 도와드릴 수 있는 골프장을 둘러보고 티타임을 문의하세요.",
  "heading": "골프장",
  "subheading": "저희 팀이 라운딩을 예약해 드릴 수 있는 골프장입니다. 티타임을 문의하시면 골프장에 확인해 드립니다.",
  "filterLabel": "국가",
  "allCountries": "모든 국가",
  "empty": "아직 등록된 골프장이 없습니다. 곧 다시 확인해 주세요.",
  "holes": "{holes}홀",
  "par": "파 {par}",
  "greenFeesFrom": "그린피 {price}부터",
  "amenitiesHeading": "시설",
  "aboutHeading": "코스 소개",
  "addressHeading": "주소",
  "askTeeTimes": "티타임 문의하기",
  "askTeeTimesHint": "원하시는 날짜, 인원, 희망 시간대를 알려주세요. 골프장에 확인 후 연락드리겠습니다.",
  "backToList": "모든 골프장",
  "courseTitle": "{name} – {country} {city} 골프",
  "amenities": {
    "caddie": "캐디", "cart": "골프 카트", "driving_range": "드라이빙 레인지", "putting_green": "퍼팅 그린",
    "clubhouse": "클럽하우스", "restaurant": "레스토랑", "club_rental": "클럽 대여", "pro_shop": "프로숍",
    "lessons": "레슨", "night_golf": "야간 골프"
  }
}
```

- [ ] **Step 4: zh**

```json
"golf": {
  "metaTitle": "高尔夫球场与开球时间",
  "metaDescription": "浏览我们可为您安排打球的高尔夫球场，并向我们的团队咨询开球时间。",
  "heading": "高尔夫球场",
  "subheading": "我们的团队可为您安排打球的球场。咨询开球时间后，我们会与球场确认。",
  "filterLabel": "国家",
  "allCountries": "所有国家",
  "empty": "目前还没有上线的高尔夫球场，敬请期待。",
  "holes": "{holes}洞",
  "par": "标准杆 {par}",
  "greenFeesFrom": "果岭费 {price} 起",
  "amenitiesHeading": "设施",
  "aboutHeading": "球场介绍",
  "addressHeading": "地址",
  "askTeeTimes": "咨询开球时间",
  "askTeeTimesHint": "请告诉我们您的日期、人数和期望时段，我们会向球场确认后回复您。",
  "backToList": "所有高尔夫球场",
  "courseTitle": "{name} – {country}{city}高尔夫",
  "amenities": {
    "caddie": "球童", "cart": "球车", "driving_range": "练习场", "putting_green": "推杆果岭",
    "clubhouse": "会所", "restaurant": "餐厅", "club_rental": "球杆租赁", "pro_shop": "专卖店",
    "lessons": "教学课程", "night_golf": "夜间高尔夫"
  }
}
```

- [ ] **Step 5:** `npx vitest run src/locales` → PASS (parity).
- [ ] **Step 6: Commit** — `feat(golf): storefront copy in en/ja/ko/zh`

---

### Task 8: Storefront components

**Files:** Create `src/components/golf/format.ts`, `GolfCourseCard.tsx`, `TeeTimeButton.tsx`; Test `src/components/golf/golf.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import en from '@/locales/en.json';
import type { GolfCourse } from '@/lib/schemas/golf';
import { GolfCourseCard } from './GolfCourseCard';
import { TeeTimeButton } from './TeeTimeButton';
import { useSupportWidgetStore } from '@/stores/supportWidgetStore';

vi.mock('next-intl', () => ({
    useTranslations: (namespace: string) => (key: string, values?: Record<string, unknown>) => {
        let node: any = en;
        for (const part of `${namespace}.${key}`.split('.')) node = node?.[part];
        if (typeof node !== 'string') return `${namespace}.${key}`;
        return node.replace(/\{(\w+)\}/g, (_, name) => String(values?.[name] ?? ''));
    },
    useLocale: () => 'en',
}));

const course: GolfCourse = {
    id: 'c1', slug: 'wack-wack-east-manila', name: 'Wack Wack East', country: 'Philippines', city: 'Manila',
    address: null, description: '', holes: 18, par: 72, greenFeeFrom: 85, currency: 'USD',
    imageUrls: [], amenities: [], status: 'published',
};

beforeEach(() => useSupportWidgetStore.setState({ isOpen: false }));

describe('GolfCourseCard', () => {
    it('links to the course and states its facts', () => {
        render(<GolfCourseCard course={course} />);
        expect(screen.getByRole('link')).toHaveAttribute('href', '/golf/wack-wack-east-manila');
        expect(screen.getByText('Wack Wack East')).toBeInTheDocument();
        expect(screen.getByText('18 holes · Par 72')).toBeInTheDocument();
        expect(screen.getByText('Green fees from $85')).toBeInTheDocument();
    });

    it('says nothing about price when there is none', () => {
        render(<GolfCourseCard course={{ ...course, greenFeeFrom: null, par: null }} />);
        expect(screen.getByText('18 holes')).toBeInTheDocument();
        expect(screen.queryByText(/green fees/i)).not.toBeInTheDocument();
    });
});

describe('TeeTimeButton', () => {
    it('opens the support chat', () => {
        render(<TeeTimeButton />);
        fireEvent.click(screen.getByRole('button', { name: 'Ask about tee times' }));
        expect(useSupportWidgetStore.getState().isOpen).toBe(true);
    });
});
```

- [ ] **Step 2:** `npx vitest run src/components/golf` → FAIL.

- [ ] **Step 3: `format.ts`**

```ts
/** "$85", "₩120,000" — whole units: a "from" price is a guide, and cents make it read like a quote. */
export function formatGreenFee(amount: number, currency: string, locale: string): string {
    try {
        return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
    } catch {
        return `${currency} ${Math.round(amount)}`;
    }
}
```

- [ ] **Step 4: `GolfCourseCard.tsx`**

```tsx
import Image from 'next/image';
import Link from 'next/link';
import { Flag } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { GolfCourse } from '@/lib/schemas/golf';
import { formatGreenFee } from './format';

/** One course in the /golf grid. Works as a server or client component. */
export function GolfCourseCard({ course }: { course: GolfCourse }) {
    const t = useTranslations('golf');
    const locale = useLocale();
    const facts = [t('holes', { holes: course.holes }), course.par ? t('par', { par: course.par }) : null]
        .filter(Boolean)
        .join(' · ');

    return (
        <Link href={`/golf/${course.slug}`}
            className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:shadow-lg dark:border-white/10 dark:bg-slate-900">
            <div className="relative aspect-[4/3] w-full overflow-hidden bg-emerald-50 dark:bg-emerald-950/30">
                {course.imageUrls[0] ? (
                    <Image src={course.imageUrls[0]} alt={course.name} fill unoptimized sizes="(min-width: 1024px) 33vw, 100vw"
                        className="object-cover transition duration-300 group-hover:scale-105" />
                ) : (
                    <Flag className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 text-emerald-300" aria-hidden />
                )}
            </div>
            <div className="flex flex-1 flex-col gap-1 p-4">
                <h2 className="font-semibold text-slate-900 dark:text-slate-100">{course.name}</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">{course.city}, {course.country}</p>
                <p className="text-sm text-slate-600 dark:text-slate-300">{facts}</p>
                {course.greenFeeFrom != null && (
                    <p className="mt-auto pt-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                        {t('greenFeesFrom', { price: formatGreenFee(course.greenFeeFrom, course.currency, locale) })}
                    </p>
                )}
            </div>
        </Link>
    );
}
```

- [ ] **Step 5: `TeeTimeButton.tsx`**

```tsx
'use client';

import { MessageCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSupportWidgetStore } from '@/stores/supportWidgetStore';

/**
 * The booking channel for golf in v1 (CONTEXT.md, "Golf Course"): the support chat. The
 * widget is mounted by the storefront layout; this only opens it.
 */
export function TeeTimeButton() {
    const t = useTranslations('golf');
    const open = useSupportWidgetStore(s => s.open);
    return (
        <button type="button" onClick={open}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white shadow-md transition hover:bg-blue-700">
            <MessageCircle className="h-5 w-5" aria-hidden /> {t('askTeeTimes')}
        </button>
    );
}
```

- [ ] **Step 6:** Re-run → PASS (3 tests).
- [ ] **Step 7: Commit** — `feat(golf): storefront card and tee-time button`

---

### Task 9: Storefront pages

**Files:** Create `src/app/(main)/golf/page.tsx`, `src/app/(main)/golf/[slug]/page.tsx`

- [ ] **Step 1: List page**

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { hreflangAlternates } from '@/lib/seo/hreflang';
import { listPublishedCountries, listPublishedCourses } from '@/lib/server/golf/courses';
import { GolfCourseCard } from '@/components/golf/GolfCourseCard';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('golf');
    return {
        title: t('metaTitle'),
        description: t('metaDescription'),
        alternates: await hreflangAlternates('/golf'),
    };
}

export default async function GolfPage({ searchParams }: { searchParams: Promise<{ country?: string }> }) {
    const { country } = await searchParams;
    const t = await getTranslations('golf');
    const [countries, courses] = await Promise.all([
        listPublishedCountries(),
        listPublishedCourses({ country: country || undefined }),
    ]);

    const pill = (active: boolean) =>
        `rounded-full border px-3 py-1 text-sm transition ${active
            ? 'border-blue-600 bg-blue-600 text-white'
            : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-white/10 dark:text-slate-300'}`;

    return (
        <main className="mx-auto min-h-screen max-w-6xl px-4 pb-20 pt-10">
            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">{t('heading')}</h1>
            <p className="mt-2 max-w-2xl text-slate-500 dark:text-slate-400">{t('subheading')}</p>

            {countries.length > 1 && (
                <nav aria-label={t('filterLabel')} className="mt-6 flex flex-wrap gap-2">
                    <Link href="/golf" className={pill(!country)}>{t('allCountries')}</Link>
                    {countries.map(c => (
                        <Link key={c} href={`/golf?country=${encodeURIComponent(c)}`} className={pill(country === c)}>{c}</Link>
                    ))}
                </nav>
            )}

            {courses.length === 0 ? (
                <p className="mt-12 text-center text-slate-500 dark:text-slate-400">{t('empty')}</p>
            ) : (
                <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {courses.map(course => <GolfCourseCard key={course.id} course={course} />)}
                </div>
            )}
        </main>
    );
}
```

- [ ] **Step 2: Detail page**

```tsx
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, Check, Flag, MapPin } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { hreflangAlternates } from '@/lib/seo/hreflang';
import { getPublishedCourseBySlug } from '@/lib/server/golf/courses';
import { formatGreenFee } from '@/components/golf/format';
import { TeeTimeButton } from '@/components/golf/TeeTimeButton';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
    const { slug } = await params;
    const course = await getPublishedCourseBySlug(slug);
    if (!course) return {};
    const t = await getTranslations('golf');
    const title = t('courseTitle', { name: course.name, city: course.city, country: course.country });
    const description = course.description.slice(0, 160) || t('metaDescription');
    return {
        title,
        description,
        alternates: await hreflangAlternates(`/golf/${slug}`),
        openGraph: {
            title, description, type: 'website',
            images: course.imageUrls[0] ? [{ url: course.imageUrls[0], alt: course.name }] : [],
        },
    };
}

export default async function GolfCoursePage({ params }: Params) {
    const { slug } = await params;
    // Drafts come back null here, so they 404 like a course that does not exist.
    const course = await getPublishedCourseBySlug(slug);
    if (!course) notFound();

    const [t, locale] = await Promise.all([getTranslations('golf'), getLocale()]);
    const [cover, ...gallery] = course.imageUrls;
    const facts = [t('holes', { holes: course.holes }), course.par ? t('par', { par: course.par }) : null].filter(Boolean);
    const paragraphs = course.description.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);

    return (
        <main className="min-h-screen pb-20">
            <div className="relative h-72 w-full overflow-hidden bg-emerald-900 md:h-96">
                {cover ? (
                    <Image src={cover} alt={course.name} fill unoptimized priority className="object-cover" />
                ) : (
                    <Flag className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 text-emerald-700" aria-hidden />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 mx-auto max-w-5xl px-4 pb-8 text-white">
                    <Link href="/golf" className="mb-3 inline-flex items-center gap-1 text-sm text-white/80 hover:text-white">
                        <ChevronLeft className="h-4 w-4" /> {t('backToList')}
                    </Link>
                    <h1 className="text-3xl font-bold drop-shadow md:text-5xl">{course.name}</h1>
                    <p className="mt-2 flex items-center gap-1.5 text-white/85"><MapPin className="h-4 w-4" /> {course.city}, {course.country}</p>
                </div>
            </div>

            <div className="mx-auto grid max-w-5xl gap-10 px-4 pt-8 lg:grid-cols-[1fr_20rem]">
                <div className="min-w-0">
                    {gallery.length > 0 && (
                        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
                            {gallery.map(url => (
                                <div key={url} className="relative aspect-[4/3] overflow-hidden rounded-xl bg-slate-100">
                                    <Image src={url} alt={course.name} fill unoptimized className="object-cover" />
                                </div>
                            ))}
                        </div>
                    )}

                    {paragraphs.length > 0 && (
                        <section className="mb-8">
                            <h2 className="mb-3 text-xl font-semibold text-slate-900 dark:text-slate-100">{t('aboutHeading')}</h2>
                            <div className="space-y-3 text-slate-600 dark:text-slate-300">
                                {paragraphs.map((p, i) => <p key={i}>{p}</p>)}
                            </div>
                        </section>
                    )}

                    {course.amenities.length > 0 && (
                        <section className="mb-8">
                            <h2 className="mb-3 text-xl font-semibold text-slate-900 dark:text-slate-100">{t('amenitiesHeading')}</h2>
                            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                {course.amenities.map(a => (
                                    <li key={a} className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
                                        <Check className="h-4 w-4 text-emerald-600" aria-hidden /> {t(`amenities.${a}`)}
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}

                    {course.address && (
                        <section>
                            <h2 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">{t('addressHeading')}</h2>
                            <p className="text-slate-600 dark:text-slate-300">{course.address}</p>
                        </section>
                    )}
                </div>

                <aside className="h-fit rounded-2xl border border-slate-200 p-5 lg:sticky lg:top-24 dark:border-white/10">
                    <p className="text-sm text-slate-600 dark:text-slate-300">{facts.join(' · ')}</p>
                    {course.greenFeeFrom != null && (
                        <p className="mt-1 text-lg font-semibold text-emerald-700 dark:text-emerald-400">
                            {t('greenFeesFrom', { price: formatGreenFee(course.greenFeeFrom, course.currency, locale) })}
                        </p>
                    )}
                    <p className="my-4 text-sm text-slate-500 dark:text-slate-400">{t('askTeeTimesHint')}</p>
                    <TeeTimeButton />
                </aside>
            </div>
        </main>
    );
}
```

- [ ] **Step 3:** `npx tsc --noEmit -p .` → no errors.
- [ ] **Step 4: Commit** — `feat(golf): storefront list and course pages`

---

### Task 10: Glossary, full verification, push

- [ ] **Step 1: CONTEXT.md** — append a section before `## Localization`:

```markdown
## Golf

**Golf Course** — a course CheapestGo can arrange play at, curated by the team in the admin (`golf_courses`). There is no supplier behind it: nothing is live, nothing is held, and the **green fee from** figure is an indicative price for the listing, never a quote. A course is a *draft* until an admin publishes it; only published courses reach the storefront, and that rule lives in `lib/server/golf/courses`, not in pages. In v1 the booking channel is the support chat — "Ask about tee times" opens it and the team confirms with the course. Course names and descriptions are written once by the team and are not per-language.
_Avoid_: calling the green fee a price the customer will pay, or a listing "availability".
```

- [ ] **Step 2: Verify**

```powershell
npx tsc --noEmit -p .
npx vitest run src/lib/schemas/golf.test.ts src/lib/server/golf src/app/api/admin/golf-courses "src/app/admin/(dashboard)/golf" src/components/golf src/locales
npx eslint src/lib/schemas/golf.ts src/lib/server/golf src/app/api/admin/golf-courses "src/app/admin/(dashboard)/golf" src/components/golf "src/app/(main)/golf" src/components/admin/Sidebar.tsx
```
Integration test with `$env:DATABASE_URL` set from `.env`. All green.

- [ ] **Step 3: Commit** — `docs(golf): glossary entry`
- [ ] **Step 4: Push** — `git push -u origin feat/golf-courses`
