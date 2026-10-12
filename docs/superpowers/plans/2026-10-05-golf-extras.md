# Golf Extras Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Customers add club rental, a caddie or a golf cart to a tee time at prices the course sets; the extras are locked into the hold and charged with the green fee.

**Architecture:** A pure module (`src/lib/golf/extras.ts`) owns the list, the checkout-URL format and the pricing, so the checkout page and the hold price extras identically. The course's offer lives in `golf_course_extras`; a hold copies the priced lines into `golf_booking_extras` and adds `extras_total` before the service fee. The checkout picker changes only the URL; the server re-renders every figure. Spec: `docs/superpowers/specs/2026-10-05-golf-extras-design.md`.

**Tech Stack:** Next.js 15, postgres.js, zod 4, next-intl, Vitest + Testing Library (happy-dom).

**Code blocks:** a fence with `file=<path>` is the complete file; other blocks are exact snippets to insert or replacements for the quoted original.

**Database tests:** `DATABASE_URL=$(grep '^DATABASE_URL=' .env | cut -d= -f2-) npx vitest run <file>`

---

## File map

| File | Change |
| --- | --- |
| `db/migrations/20261005000002_golf_extras.sql` | new |
| `src/lib/golf/extras.ts` (+ test) | new — list, URL format, sanitize, price |
| `src/lib/schemas/golf.ts` (+ test) | `holdRequestSchema.extras`, `golfExtrasInputSchema`, `GolfBooking.extras/extrasTotal` |
| `src/lib/server/golf/errors.ts` | `extras_unavailable` |
| `src/lib/server/golf/extras.ts` | new — `listCourseExtras`, `setCourseExtras` |
| `src/lib/server/golf/bookings.ts` (+ integration test) | hold prices extras; reads carry extras |
| `src/app/api/golf/bookings/route.test.ts` | hold receives `extras` |
| `src/app/api/admin/golf-extras/route.ts` (+ test) | new |
| `src/app/admin/(dashboard)/golf/CourseExtras.tsx` (+ test) | new — Extras in the Tee times window |
| `src/app/admin/(dashboard)/golf/TeeTimeSchedules.tsx` | renders `CourseExtras` |
| `src/app/admin/(dashboard)/golf/bookings/GolfBookingsClient.tsx` | extras under players |
| `src/locales/{en,ja,ko,zh}.json` | five `golf.booking` keys |
| `src/app/(main)/golf/[slug]/book/page.tsx`, `BookTeeTimeClient.tsx` (+ test) | Extras picker, lines, totals |
| `src/app/(main)/golf/bookings/[reference]/page.tsx` | extra lines |
| `src/lib/server/golf/emails.ts` (+ test) | extra lines |

---

### Task 1: Migration

- [x] **Step 1: Write**

```sql file=db/migrations/20261005000002_golf_extras.sql
-- migrate:up
-- Golf extras (CONTEXT.md, "Golf Booking"): club rental, caddie and cart, priced per item by the
-- course. A hold copies the priced lines onto the booking, so a later price change never
-- changes what a customer was quoted.

CREATE TABLE IF NOT EXISTS public.golf_course_extras (
    course_id  uuid NOT NULL REFERENCES public.golf_courses(id) ON DELETE CASCADE,
    -- Open vocabulary (CONTEXT.md, "Enum field"): a CHECK swap is cheaper than a native enum.
    code       text NOT NULL,
    price      numeric(10,2) NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    PRIMARY KEY (course_id, code),
    CONSTRAINT golf_course_extras_code_check CHECK (code IN ('club_rental', 'caddie', 'cart')),
    CONSTRAINT golf_course_extras_price_check CHECK (price >= 0)
);

CREATE TABLE IF NOT EXISTS public.golf_booking_extras (
    booking_id uuid NOT NULL REFERENCES public.golf_bookings(id) ON DELETE CASCADE,
    code       text NOT NULL,
    quantity   integer NOT NULL,
    unit_price numeric(10,2) NOT NULL,
    total      numeric(10,2) NOT NULL,
    PRIMARY KEY (booking_id, code),
    CONSTRAINT golf_booking_extras_code_check CHECK (code IN ('club_rental', 'caddie', 'cart')),
    CONSTRAINT golf_booking_extras_quantity_check CHECK (quantity BETWEEN 1 AND 4)
);

ALTER TABLE public.golf_bookings ADD COLUMN IF NOT EXISTS extras_total numeric(10,2) NOT NULL DEFAULT 0;

-- migrate:down
ALTER TABLE public.golf_bookings DROP COLUMN IF EXISTS extras_total;
DROP TABLE IF EXISTS public.golf_booking_extras;
DROP TABLE IF EXISTS public.golf_course_extras;
```

- [x] **Step 2: Apply locally**

```bash
sed -n '/-- migrate:up/,/-- migrate:down/p' db/migrations/20261005000002_golf_extras.sql \
  | docker exec -i cheapest-go-app-postgres-1 sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```
Expected: `CREATE TABLE` ×2, `ALTER TABLE`.

- [x] **Step 3: Commit** — `git add db/migrations/20261005000002_golf_extras.sql && git commit -m "feat(golf): extras tables"`

---

### Task 2: Pricing extras (pure) and schemas

**Files:** Create `src/lib/golf/extras.ts` (+ test); Modify `src/lib/schemas/golf.ts` (+ test), `src/lib/server/golf/emails.test.ts` (fixture)

- [x] **Step 1: Failing tests**

```ts file=src/lib/golf/extras.test.ts
import { describe, it, expect } from 'vitest';
import { formatExtrasParam, parseExtrasParam, priceExtras, sameExtras, sanitizeExtras } from './extras';

const offers = [{ code: 'club_rental' as const, price: 45 }, { code: 'cart' as const, price: 25 }];

describe('parseExtrasParam / formatExtrasParam', () => {
    it('round-trips the checkout URL in a fixed order', () => {
        const choices = parseExtrasParam('cart:1,club_rental:2');
        expect(choices).toEqual([{ code: 'club_rental', quantity: 2 }, { code: 'cart', quantity: 1 }]);
        expect(formatExtrasParam(choices)).toBe('club_rental:2,cart:1');
    });

    it('drops unknown codes, bad numbers, zeros and repeats', () => {
        expect(parseExtrasParam('jetpack:1,caddie:x,cart:0,caddie:1,caddie:3')).toEqual([{ code: 'caddie', quantity: 1 }]);
        expect(parseExtrasParam(undefined)).toEqual([]);
        expect(formatExtrasParam([{ code: 'cart', quantity: 0 }])).toBe('');
    });
});

describe('sanitizeExtras', () => {
    it('keeps only offered extras, at most one per player', () => {
        expect(sanitizeExtras([{ code: 'caddie', quantity: 1 }, { code: 'club_rental', quantity: 4 }], offers, 2))
            .toEqual([{ code: 'club_rental', quantity: 2 }]);
    });
});

describe('priceExtras', () => {
    it('prices each line per item and totals them', () => {
        expect(priceExtras([{ code: 'cart', quantity: 1 }, { code: 'club_rental', quantity: 2 }], offers, 2)).toEqual({
            ok: true,
            lines: [
                { code: 'club_rental', quantity: 2, unitPrice: 45, total: 90 },
                { code: 'cart', quantity: 1, unitPrice: 25, total: 25 },
            ],
            total: 115,
        });
        expect(priceExtras([], offers, 2)).toEqual({ ok: true, lines: [], total: 0 });
    });

    it('refuses an extra the course does not offer, or more than one per player', () => {
        expect(priceExtras([{ code: 'caddie', quantity: 1 }], offers, 2)).toEqual({ ok: false, reason: 'not_offered', code: 'caddie' });
        expect(priceExtras([{ code: 'cart', quantity: 3 }], offers, 2)).toEqual({ ok: false, reason: 'too_many', code: 'cart' });
    });
});

describe('sameExtras', () => {
    it('ignores order and zero quantities', () => {
        expect(sameExtras([{ code: 'cart', quantity: 1 }, { code: 'caddie', quantity: 0 }], [{ code: 'cart', quantity: 1 }])).toBe(true);
        expect(sameExtras([{ code: 'cart', quantity: 1 }], [{ code: 'cart', quantity: 2 }])).toBe(false);
    });
});
```

Append to `src/lib/schemas/golf.test.ts` (and add `golfExtrasInputSchema` to its import from `./golf`):
```ts
describe('extras in a hold request', () => {
    const ok = { teeTimeId: '6f1c2e0a-9b7d-4c1e-a2f5-3d8e1b0c7a44', players: 2, leadName: 'Ana' };

    it('defaults to none, and refuses an unknown extra or one chosen twice', () => {
        expect(holdRequestSchema.parse(ok).extras).toEqual([]);
        expect(holdRequestSchema.safeParse({ ...ok, extras: [{ code: 'cart', quantity: 1 }, { code: 'cart', quantity: 2 }] }).success).toBe(false);
        expect(holdRequestSchema.safeParse({ ...ok, extras: [{ code: 'jetpack', quantity: 1 }] }).success).toBe(false);
    });
});

describe('golfExtrasInputSchema', () => {
    it('takes one price per offered extra', () => {
        expect(golfExtrasInputSchema.parse([{ code: 'caddie', price: 30 }])).toEqual([{ code: 'caddie', price: 30 }]);
        expect(golfExtrasInputSchema.safeParse([{ code: 'caddie', price: -1 }]).success).toBe(false);
        expect(golfExtrasInputSchema.safeParse([{ code: 'cart', price: 1 }, { code: 'cart', price: 2 }]).success).toBe(false);
    });
});
```

- [x] **Step 2: Run, expect FAIL** — `npx vitest run src/lib/golf/extras.test.ts src/lib/schemas/golf.test.ts`

- [x] **Step 3: Implement**

```ts file=src/lib/golf/extras.ts
/**
 * Golf extras (CONTEXT.md, "Golf Booking"): what a customer can add to a tee time, priced per
 * item by the course. The codes are amenity codes, so storefront names come from the existing
 * `golf.amenities.*` labels. Client-safe and pure: the checkout page and the hold both price
 * extras through here, so the total shown is the total held.
 */

export const GOLF_EXTRAS = ['club_rental', 'caddie', 'cart'] as const;
export type GolfExtraCode = (typeof GOLF_EXTRAS)[number];

/** English names, for the emails and the back office. */
export const EXTRA_NAMES_EN: Record<GolfExtraCode, string> = {
    club_rental: 'Club rental', caddie: 'Caddie', cart: 'Golf cart',
};

/** What one item is, for the back office. */
export const EXTRA_UNITS_EN: Record<GolfExtraCode, string> = {
    club_rental: 'per set', caddie: 'per caddie', cart: 'per cart',
};

/** What the customer asked for. */
export interface ExtraChoice {
    code: GolfExtraCode;
    quantity: number;
}

/** What the course offers, at its price per item. */
export interface ExtraOffer {
    code: GolfExtraCode;
    price: number;
}

/** A priced line on a booking. */
export interface ExtraLine {
    code: GolfExtraCode;
    quantity: number;
    unitPrice: number;
    total: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const isExtra = (code: string): code is GolfExtraCode => (GOLF_EXTRAS as readonly string[]).includes(code);
const byListOrder = (a: { code: GolfExtraCode }, b: { code: GolfExtraCode }) =>
    GOLF_EXTRAS.indexOf(a.code) - GOLF_EXTRAS.indexOf(b.code);

/** `club_rental:2,cart:1` → choices. Unknown codes, bad numbers, zeros and repeats are dropped. */
export function parseExtrasParam(value: string | null | undefined): ExtraChoice[] {
    if (!value) return [];
    const seen = new Set<string>();
    const out: ExtraChoice[] = [];
    for (const part of value.split(',')) {
        const [code, count] = part.split(':');
        const quantity = Number(count);
        if (!isExtra(code) || seen.has(code) || !Number.isInteger(quantity) || quantity < 1) continue;
        seen.add(code);
        out.push({ code, quantity });
    }
    return out.sort(byListOrder);
}

/** The reverse of parseExtrasParam; zero quantities are left out. */
export function formatExtrasParam(choices: ExtraChoice[]): string {
    return choices
        .filter(c => c.quantity > 0)
        .sort(byListOrder)
        .map(c => `${c.code}:${c.quantity}`)
        .join(',');
}

/** Choices a page can show: only extras on offer, at most one per player, none at zero. */
export function sanitizeExtras(choices: ExtraChoice[], offers: ExtraOffer[], players: number): ExtraChoice[] {
    const offered = new Set(offers.map(o => o.code));
    return choices
        .filter(c => offered.has(c.code) && c.quantity > 0)
        .map(c => ({ code: c.code, quantity: Math.min(c.quantity, players) }))
        .sort(byListOrder);
}

export type PricedExtras =
    | { ok: true; lines: ExtraLine[]; total: number }
    | { ok: false; reason: 'not_offered' | 'too_many'; code: GolfExtraCode };

/** Prices choices against the course's offer. Refuses, rather than corrects, anything invalid. */
export function priceExtras(choices: ExtraChoice[], offers: ExtraOffer[], players: number): PricedExtras {
    const lines: ExtraLine[] = [];
    for (const choice of [...choices].sort(byListOrder)) {
        if (choice.quantity < 1) continue;
        const offer = offers.find(o => o.code === choice.code);
        if (!offer) return { ok: false, reason: 'not_offered', code: choice.code };
        if (choice.quantity > players) return { ok: false, reason: 'too_many', code: choice.code };
        lines.push({ code: choice.code, quantity: choice.quantity, unitPrice: offer.price, total: round2(offer.price * choice.quantity) });
    }
    return { ok: true, lines, total: round2(lines.reduce((sum, line) => sum + line.total, 0)) };
}

/** Whether two sets of choices ask for the same thing. */
export function sameExtras(a: ExtraChoice[], b: ExtraChoice[]): boolean {
    return formatExtrasParam(a) === formatExtrasParam(b);
}
```

In `src/lib/schemas/golf.ts`:
- add `import { GOLF_EXTRAS, type ExtraLine } from '@/lib/golf/extras';`
- replace `holdRequestSchema` with:
```ts
const extraChoiceSchema = z.object({
    code: z.enum(GOLF_EXTRAS),
    quantity: z.number().int().min(1).max(4),
});

export const holdRequestSchema = z.object({
    teeTimeId: z.string().uuid(),
    players: z.number().int().min(1).max(4),
    leadName: requiredText('Lead player name', 120),
    extras: z
        .array(extraChoiceSchema)
        .max(GOLF_EXTRAS.length)
        .optional()
        .default([])
        .refine(list => new Set(list.map(e => e.code)).size === list.length, 'Each extra can be chosen once'),
});

/** The extras a course offers, at its price per item (admin). */
export const golfExtrasInputSchema = z
    .array(z.object({
        code: z.enum(GOLF_EXTRAS),
        price: z.number().min(0, 'Price cannot be negative').max(100_000),
    }))
    .max(GOLF_EXTRAS.length)
    .refine(list => new Set(list.map(e => e.code)).size === list.length, 'Each extra can be offered once');
```
- in `GolfBooking`, after `greenFeeTotal: number;` add:
```ts
    /** Sum of the extras' lines; the service fee is charged on green fee + extras. */
    extrasTotal: number;
    extras: ExtraLine[];
```

In `src/lib/server/golf/emails.test.ts`, the `booking` fixture gains `extrasTotal: 0, extras: [],` after `greenFeeTotal: 5000,`.

- [x] **Step 4: Run, expect PASS** — `npx vitest run src/lib/golf src/lib/schemas src/lib/server/golf/emails.test.ts`

- [x] **Step 5: Commit** — `git add src/lib/golf src/lib/schemas src/lib/server/golf/emails.test.ts && git commit -m "feat(golf): price extras per item; extras in the hold request"`

---

### Task 3: Course extras and the hold

**Files:** Create `src/lib/server/golf/extras.ts`; Modify `src/lib/server/golf/errors.ts`, `src/lib/server/golf/bookings.ts`, `bookings.integration.test.ts`, `src/app/api/golf/bookings/route.test.ts`

- [x] **Step 1: Failing tests** — in `bookings.integration.test.ts`:

Imports: add `import { golfServiceFee } from '@/lib/pricing';`, `import type { ExtraChoice } from '@/lib/golf/extras';`, `import { listCourseExtras, setCourseExtras } from './extras';`.

At the end of `beforeAll`:
```ts
    await setCourseExtras(courseId, [{ code: 'club_rental', price: 45 }, { code: 'cart', price: 25 }]);
```

Replace the `hold` helper:
```ts
const hold = (user: number, teeTimeId: string, players = 1, now = NOW, extras: ExtraChoice[] = []) =>
    holdTeeTime({ userId: users[user], email: `golf-${run}-${user}@example.com`, teeTimeId, players, leadName: 'Test Player', extras }, now);
```

Append inside the `describe`:
```ts
    it('lets the admin replace what a course offers', async () => {
        expect(await listCourseExtras(courseId)).toEqual([{ code: 'club_rental', price: 45 }, { code: 'cart', price: 25 }]);
        expect(await setCourseExtras(courseId, [{ code: 'caddie', price: 30 }])).toEqual([{ code: 'caddie', price: 30 }]);
        await setCourseExtras(courseId, [{ code: 'cart', price: 25 }, { code: 'club_rental', price: 45 }]);
        expect(await setCourseExtras(crypto.randomUUID(), [])).toBeNull();
    });

    it('locks extras into the hold and charges the fee on green fee plus extras', async () => {
        const id = await teeTime(13);
        const { booking } = await hold(0, id, 2, NOW, [{ code: 'cart', quantity: 1 }, { code: 'club_rental', quantity: 2 }]);
        expect(booking.extras).toEqual([
            { code: 'club_rental', quantity: 2, unitPrice: 45, total: 90 },
            { code: 'cart', quantity: 1, unitPrice: 25, total: 25 },
        ]);
        expect(booking.extrasTotal).toBe(115);
        const charged = Math.round(golfServiceFee(315, 'USD', amount => amount).chargedTotal * 100) / 100;
        expect(booking.total).toBe(charged);
        expect(booking.serviceFee).toBe(Math.round((charged - 315) * 100) / 100);
    });

    it('starts a new hold when the extras change, and refuses an extra not on offer', async () => {
        const id = await teeTime(14);
        const first = await hold(0, id, 1, NOW, [{ code: 'cart', quantity: 1 }]);
        expect((await hold(0, id, 1, NOW, [{ code: 'cart', quantity: 1 }])).booking.reference).toBe(first.booking.reference);
        const changed = await hold(0, id, 1, NOW, []);
        expect(changed.booking.reference).not.toBe(first.booking.reference);
        expect((await getBookingById(first.booking.id))?.status).toBe('expired');
        await expect(hold(0, id, 1, NOW, [{ code: 'caddie', quantity: 1 }])).rejects.toMatchObject({ code: 'extras_unavailable' });
    });
```

In `src/app/api/golf/bookings/route.test.ts`, the hold expectation becomes:
```ts
        expect(holdTeeTime).toHaveBeenCalledWith({ userId: 'u1', email: 'ana@example.com', teeTimeId, players: 2, leadName: 'Ana Cruz', extras: [] });
```

- [x] **Step 2: Run, expect FAIL** — the database test command on `src/lib/server/golf/bookings.integration.test.ts` → cannot resolve `./extras`.

- [x] **Step 3: Course extras**

```ts file=src/lib/server/golf/extras.ts
import { getSqlAdmin } from '@/lib/db/postgres';
import { GOLF_EXTRAS, type ExtraOffer } from '@/lib/golf/extras';

/**
 * The extras a course offers (CONTEXT.md, "Golf Booking"), at its price per item. Not offered
 * means no row.
 */

export async function listCourseExtras(courseId: string): Promise<ExtraOffer[]> {
    const sql = getSqlAdmin();
    const rows = await sql<ExtraOffer[]>`
        SELECT code, price::float8 AS price FROM golf_course_extras
         WHERE course_id = ${courseId}
         ORDER BY array_position(${[...GOLF_EXTRAS]}::text[], code)`;
    return rows.map(row => ({ code: row.code, price: row.price }));
}

/** Replaces the extras a course offers; null when there is no such course. */
export async function setCourseExtras(courseId: string, offers: ExtraOffer[]): Promise<ExtraOffer[] | null> {
    const sql = getSqlAdmin();
    const [course] = await sql`SELECT 1 FROM golf_courses WHERE id = ${courseId}`;
    if (!course) return null;
    await sql.begin(async tx => {
        await tx`DELETE FROM golf_course_extras WHERE course_id = ${courseId}`;
        if (offers.length > 0) {
            await tx`INSERT INTO golf_course_extras ${tx(offers.map(o => ({ course_id: courseId, code: o.code, price: o.price })))}`;
        }
    });
    return listCourseExtras(courseId);
}
```

- [x] **Step 4: errors.ts** — `GolfBookingErrorCode` gains `| 'extras_unavailable'` and `HTTP_STATUS` gains `extras_unavailable: 409,`.

- [x] **Step 5: bookings.ts**

Imports: add `import { priceExtras, sameExtras, type ExtraChoice } from '@/lib/golf/extras';` and `import { listCourseExtras } from './extras';`.

`HoldInput` gains:
```ts
    /** Club rental, caddie, cart; priced against the course's current offer. */
    extras?: ExtraChoice[];
```

In `selectBookings`, replace `b.refund_amount::float8 AS "refundAmount", b.free_cancel_until AS "freeCancelUntil"` with:
```sql
               b.refund_amount::float8 AS "refundAmount", b.free_cancel_until AS "freeCancelUntil",
               b.extras_total::float8 AS "extrasTotal",
               COALESCE((SELECT json_agg(json_build_object(
                                'code', e.code, 'quantity', e.quantity,
                                'unitPrice', e.unit_price::float8, 'total', e.total::float8)
                            ORDER BY array_position(ARRAY['club_rental', 'caddie', 'cart'], e.code))
                           FROM golf_booking_extras e WHERE e.booking_id = b.id), '[]'::json) AS extras
```

In `holdTeeTime`, replace everything from `const [live] = …` through `const serviceFee = round2(total - greenFeeTotal);` with:
```ts
    const bookable = await getBookableTeeTime(input.teeTimeId, now);
    if (!bookable) throw new GolfBookingError('tee_time_unavailable', 'That tee time can no longer be booked. Please pick another.');
    const { teeTime, course } = bookable;

    const choices = input.extras ?? [];
    const priced = priceExtras(choices, await listCourseExtras(course.id), input.players);
    if (!priced.ok) {
        throw new GolfBookingError(
            'extras_unavailable', 'The extras on offer have changed. Please review them and try again.',
            { extra: priced.code, reason: priced.reason },
        );
    }

    const [live] = await sql<{ id: string; players: number }[]>`
        SELECT id, players FROM golf_bookings
         WHERE user_id = ${input.userId} AND tee_time_id = ${input.teeTimeId} AND status = 'held'`;
    if (live) {
        // Resumed only for the same party and the same extras: anything else changes the amount
        // the card must be authorised for.
        const resumed = live.players === input.players ? await resume(live.id) : null;
        if (resumed && sameExtras(resumed.booking.extras, choices)) return resumed;
        await endHold(live.id, now);
    }

    const greenFeeTotal = round2(teeTime.pricePerPlayer * input.players);
    const base = round2(greenFeeTotal + priced.total);
    if (teeTime.currency !== 'USD') await refreshExchangeRates();
    const fee = golfServiceFee(base, teeTime.currency, convertCurrencyStrict);
    const total = round2(fee.chargedTotal);
    const serviceFee = round2(total - base);
```
(The early `teeTime.spotsLeft < input.players` check goes: the customer's own live hold may still be holding the spots when it is read, and the conditional `UPDATE` is the real guard either way.)

In the hold's `INSERT INTO golf_bookings`, add `extras_total` after `service_fee` in the column list and `${priced.total}` after `${serviceFee}` in the values; then replace `return row.id;` with:
```ts
            if (priced.lines.length > 0) {
                await tx`
                    INSERT INTO golf_booking_extras ${tx(priced.lines.map(line => ({
                        booking_id: row.id, code: line.code, quantity: line.quantity,
                        unit_price: line.unitPrice, total: line.total,
                    })))}`;
            }
            return row.id;
```

In the PaymentIntent metadata, after `greenFeeTotal: String(greenFeeTotal),` add `extrasTotal: String(priced.total),`.

- [x] **Step 6: Run, expect PASS** — the database test command on `src/lib/server/golf`, and `npx vitest run src/app/api/golf`.

- [x] **Step 7: Commit** — `git add src/lib/server/golf src/app/api/golf && git commit -m "feat(golf): holds price extras against the course's offer and lock them in"`

---

### Task 4: Admin — offer extras, see them on bookings

**Files:** Create `src/app/api/admin/golf-extras/route.ts` (+ test), `src/app/admin/(dashboard)/golf/CourseExtras.tsx` (+ test); Modify `TeeTimeSchedules.tsx`, `bookings/GolfBookingsClient.tsx`

- [x] **Step 1: Failing tests**

```ts file=src/app/api/admin/golf-extras/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

const auth = vi.hoisted(() => ({ result: { user: { id: 'admin-1', email: 'a@x.com' } } as unknown }));

vi.mock('@/lib/server/admin', () => ({
    requireAdmin: vi.fn(async () => auth.result),
    isAuthError: (r: unknown) => r instanceof Response,
}));
vi.mock('@/lib/server/rate-limit', () => ({ rateLimit: vi.fn(async () => ({ success: true })) }));
vi.mock('@/lib/server/admin/audit', () => ({ logAdminAction: vi.fn() }));
vi.mock('@/lib/server/golf/extras', () => ({
    listCourseExtras: vi.fn(async () => [{ code: 'caddie', price: 30 }]),
    setCourseExtras: vi.fn(async (_courseId: string, offers: unknown) => offers),
}));

import { GET, POST } from './route';
import { setCourseExtras } from '@/lib/server/golf/extras';

const courseId = '6f1c2e0a-9b7d-4c1e-a2f5-3d8e1b0c7a44';
const post = (body: unknown) =>
    POST(new Request('http://localhost/api/admin/golf-extras', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }) as never);

beforeEach(() => { auth.result = { user: { id: 'admin-1', email: 'a@x.com' } }; });

describe('/api/admin/golf-extras', () => {
    it('refuses anyone who is not an admin', async () => {
        auth.result = NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        expect((await post({ courseId, extras: [] })).status).toBe(403);
    });

    it('lists a course\'s extras, and needs the course id', async () => {
        const res = await GET(new Request(`http://localhost/api/admin/golf-extras?courseId=${courseId}`) as never);
        expect(await res.json()).toEqual({ success: true, data: [{ code: 'caddie', price: 30 }] });
        expect((await GET(new Request('http://localhost/api/admin/golf-extras') as never)).status).toBe(400);
    });

    it('replaces the offer', async () => {
        const extras = [{ code: 'club_rental', price: 45 }, { code: 'cart', price: 25 }];
        const res = await post({ courseId, extras });
        expect(res.status).toBe(200);
        expect(setCourseExtras).toHaveBeenCalledWith(courseId, extras);
    });

    it('refuses a bad offer and an unknown course', async () => {
        expect((await post({ courseId, extras: [{ code: 'jetpack', price: 1 }] })).status).toBe(400);
        vi.mocked(setCourseExtras).mockResolvedValueOnce(null);
        expect((await post({ courseId, extras: [] })).status).toBe(404);
    });
});
```

```tsx file=src/app/admin/(dashboard)/golf/CourseExtras.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { CourseExtras } from './CourseExtras';

const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
    new Response(JSON.stringify(init?.method === 'POST'
        ? { success: true, data: JSON.parse(String(init.body)).extras }
        : { success: true, data: [{ code: 'caddie', price: 30 }] })));

beforeEach(() => {
    fetchMock.mockClear();
    vi.stubGlobal('fetch', fetchMock);
});

describe('CourseExtras', () => {
    it('shows what the course offers and saves the new offer', async () => {
        render(<CourseExtras courseId="c1" currency="USD" />);
        expect(await screen.findByLabelText('Offer Caddie')).toBeChecked();
        expect(screen.getByLabelText('Caddie price')).toHaveValue(30);

        fireEvent.click(screen.getByLabelText('Offer Golf cart'));
        fireEvent.change(screen.getByLabelText('Golf cart price'), { target: { value: '25' } });
        fireEvent.click(screen.getByRole('button', { name: /save extras/i }));

        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
        const [, init] = fetchMock.mock.calls[1];
        expect(JSON.parse(String(init?.body))).toEqual({
            courseId: 'c1', extras: [{ code: 'caddie', price: 30 }, { code: 'cart', price: 25 }],
        });
    });
});
```

- [x] **Step 2: Run, expect FAIL** — `npx vitest run src/app/api/admin/golf-extras "src/app/admin/(dashboard)/golf/CourseExtras.test.tsx"`

- [x] **Step 3: Route**

```ts file=src/app/api/admin/golf-extras/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin, isAuthError } from '@/lib/server/admin';
import { rateLimit } from '@/lib/server/rate-limit';
import { logAdminAction } from '@/lib/server/admin/audit';
import { golfExtrasInputSchema } from '@/lib/schemas/golf';
import { listCourseExtras, setCourseExtras } from '@/lib/server/golf/extras';

export const dynamic = 'force-dynamic';

/** The extras a course offers. Same shape as api/admin/golf-schedules. */

const idSchema = z.string().uuid();

function fail(status: number, error: string) {
    return NextResponse.json({ success: false, error }, { status });
}

export async function GET(req: NextRequest) {
    const rl = await rateLimit(req, { limit: 60, windowMs: 60_000, prefix: 'admin-golf-extras' });
    if (!rl.success) return fail(429, 'Too many requests');

    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    const courseId = idSchema.safeParse(new URL(req.url).searchParams.get('courseId'));
    if (!courseId.success) return fail(400, 'courseId is required');
    return NextResponse.json({ success: true, data: await listCourseExtras(courseId.data) });
}

export async function POST(req: NextRequest) {
    const rl = await rateLimit(req, { limit: 20, windowMs: 60_000, prefix: 'admin-golf-extras-post' });
    if (!rl.success) return fail(429, 'Too many requests');

    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return fail(400, 'Invalid JSON');
    const courseId = idSchema.safeParse(body.courseId);
    if (!courseId.success) return fail(400, 'courseId is required');
    const parsed = golfExtrasInputSchema.safeParse(body.extras);
    if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? 'Invalid extras');

    const saved = await setCourseExtras(courseId.data, parsed.data);
    if (!saved) return fail(404, 'Course not found');
    logAdminAction({
        action: 'set_golf_course_extras', adminId: auth.user.id, adminEmail: auth.user.email,
        targetId: courseId.data, details: { extras: saved },
    });
    return NextResponse.json({ success: true, data: saved });
}
```

- [x] **Step 4: Admin Extras section**

```tsx file=src/app/admin/(dashboard)/golf/CourseExtras.tsx
'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import {
    EXTRA_NAMES_EN, EXTRA_UNITS_EN, GOLF_EXTRAS, type ExtraOffer, type GolfExtraCode,
} from '@/lib/golf/extras';

/** Admin-only, so English (CONTEXT.md, "Interface Language"). */

type Row = { offered: boolean; price: string };
type Rows = Record<GolfExtraCode, Row>;

const inputClass =
    'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm disabled:opacity-50 dark:border-white/10 dark:bg-white/5';

/** What customers can add to a tee time at this course, at a price per item. */
export function CourseExtras({ courseId, currency }: { courseId: string; currency: string }) {
    const [rows, setRows] = useState<Rows | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let cancelled = false;
        fetch(`/api/admin/golf-extras?courseId=${courseId}`)
            .then(response => response.json())
            .then((json: { data?: ExtraOffer[] }) => {
                if (cancelled) return;
                setRows(Object.fromEntries(GOLF_EXTRAS.map(code => {
                    const offer = json.data?.find(o => o.code === code);
                    return [code, { offered: Boolean(offer), price: offer ? String(offer.price) : '' }];
                })) as Rows);
            })
            .catch(() => { if (!cancelled) toast.error('Could not load extras'); });
        return () => { cancelled = true; };
    }, [courseId]);

    if (!rows) return <Loader2 className="h-4 w-4 animate-spin text-slate-400" aria-label="Loading extras" />;

    const update = (code: GolfExtraCode, change: Partial<Row>) => setRows({ ...rows, [code]: { ...rows[code], ...change } });

    const save = async () => {
        setSaving(true);
        try {
            const extras = GOLF_EXTRAS
                .filter(code => rows[code].offered)
                .map(code => ({ code, price: Number(rows[code].price) }));
            const response = await fetch('/api/admin/golf-extras', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ courseId, extras }),
            });
            const json = await response.json().catch(() => ({}));
            if (!response.ok) {
                toast.error(json.error ?? 'Could not save extras');
                return;
            }
            toast.success('Extras saved');
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 dark:border-white/10">
            <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Extras</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                    Customers can add these to a tee time, up to one per player. Prices are per item, in {currency}. A fee the course always charges belongs in the tee-time price.
                </p>
            </div>
            {GOLF_EXTRAS.map(code => (
                <div key={code} className="grid grid-cols-[1fr_9rem] items-center gap-3">
                    <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                        <input type="checkbox" aria-label={`Offer ${EXTRA_NAMES_EN[code]}`} checked={rows[code].offered}
                            onChange={e => update(code, { offered: e.target.checked })} />
                        {EXTRA_NAMES_EN[code]} <span className="text-xs text-slate-400">{EXTRA_UNITS_EN[code]}</span>
                    </label>
                    <input type="number" min="0" step="0.01" aria-label={`${EXTRA_NAMES_EN[code]} price`}
                        disabled={!rows[code].offered} value={rows[code].price}
                        onChange={e => update(code, { price: e.target.value })} className={inputClass} />
                </div>
            ))}
            <div className="flex justify-end">
                <button type="button" onClick={() => void save()} disabled={saving}
                    className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50">
                    {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save extras
                </button>
            </div>
        </section>
    );
}
```

In `TeeTimeSchedules.tsx` add `import { CourseExtras } from './CourseExtras';` and, directly before the `{status === 'draft' ? (` block:
```tsx
            <CourseExtras courseId={course.id} currency={course.currency} />
```

- [x] **Step 5: Bookings queue** — in `GolfBookingsClient.tsx` add `import { EXTRA_NAMES_EN } from '@/lib/golf/extras';` and replace `<td className="px-4 py-2 tabular-nums">{b.players}</td>` with:
```tsx
                                <td className="px-4 py-2">
                                    <span className="tabular-nums">{b.players}</span>
                                    {b.extras.length > 0 && (
                                        <span className="block text-xs text-slate-500">
                                            {b.extras.map(e => `${EXTRA_NAMES_EN[e.code]} × ${e.quantity}`).join(', ')}
                                        </span>
                                    )}
                                </td>
```

- [x] **Step 6: Run, expect PASS** — `npx vitest run src/app/api/admin/golf-extras "src/app/admin/(dashboard)/golf"`

- [x] **Step 7: Commit** — `git add src/app/api/admin/golf-extras "src/app/admin/(dashboard)/golf" && git commit -m "feat(golf): admin sets a course's extras and sees them on bookings"`

---

### Task 5: Customer — choose extras, see them everywhere

**Files:** Modify `src/locales/{en,ja,ko,zh}.json`, `src/app/(main)/golf/[slug]/book/page.tsx` (whole file), `BookTeeTimeClient.tsx` (whole file), `src/app/(main)/golf/bookings/[reference]/page.tsx`, `src/lib/server/golf/emails.ts` (+ test); Create `src/app/(main)/golf/[slug]/book/BookTeeTimeClient.test.tsx`

- [x] **Step 1: Copy**

```bash
node -e "
const fs = require('fs');
const keys = {
  en: { extrasHeading: 'Extras', extrasHint: 'Optional. Our team arranges them with the course when confirming your tee time.', extraEach: '{price} each', extraLine: '{name} × {count}', extrasUnavailable: 'The extras on offer have changed. Please review them and try again.' },
  ja: { extrasHeading: 'オプション', extrasHint: '任意です。ティータイムの確定時に、当社スタッフがゴルフ場に手配します。', extraEach: '1点あたり{price}', extraLine: '{name} × {count}', extrasUnavailable: '提供されているオプションが変更されました。内容をご確認のうえ、もう一度お試しください。' },
  ko: { extrasHeading: '추가 옵션', extrasHint: '선택 사항입니다. 티타임을 확정할 때 저희 팀이 골프장에 함께 요청합니다.', extraEach: '개당 {price}', extraLine: '{name} × {count}', extrasUnavailable: '제공되는 옵션이 변경되었습니다. 다시 확인한 후 시도해 주세요.' },
  zh: { extrasHeading: '附加服务', extrasHint: '可选。我们的团队会在确认开球时间时一并向球场安排。', extraEach: '每项 {price}', extraLine: '{name} × {count}', extrasUnavailable: '可选的附加服务已有变动。请重新查看后再试。' },
};
for (const [locale, add] of Object.entries(keys)) {
  const path = 'src/locales/' + locale + '.json';
  const messages = JSON.parse(fs.readFileSync(path, 'utf8'));
  Object.assign(messages.golf.booking, add);
  fs.writeFileSync(path, JSON.stringify(messages, null, 2) + '\n');
}
console.log('extras copy added');"
```

- [x] **Step 2: Failing tests**

```tsx file=src/app/(main)/golf/[slug]/book/BookTeeTimeClient.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import en from '@/locales/en.json';

vi.mock('next-intl', () => ({
    useTranslations: (namespace: string) => (key: string, values?: Record<string, unknown>) => {
        let node: any = en;
        for (const part of `${namespace}.${key}`.split('.')) node = node?.[part];
        if (typeof node !== 'string') return `${namespace}.${key}`;
        return node.replace(/\{(\w+)\}/g, (_: string, name: string) => String(values?.[name] ?? ''));
    },
}));
const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/components/checkout/StripeEmbeddedCheckout', () => ({ default: () => <div>card form</div> }));

import { BookTeeTimeClient } from './BookTeeTimeClient';

const summary = {
    courseName: 'Wack Wack', courseHref: '/golf/wack-wack', date: 'Wednesday, 7 October 2026', time: '07:00 course time',
    greenFeeLabel: 'Green fee (2 × $85.00)', greenFee: '$170.00',
    extraLines: [{ label: 'Club rental × 1', amount: '$45.00' }],
    serviceFee: '$13.09', total: '$228.09', freeCancel: 'Free cancellation until Oct 5, 2026, 7:00 AM.',
};
const extras = [
    { code: 'club_rental' as const, name: 'Club rental', each: '$45.00 each', quantity: 1 },
    { code: 'cart' as const, name: 'Golf cart', each: '$25.00 each', quantity: 0 },
];
const fetchMock = vi.fn(async () => new Response(
    JSON.stringify({ success: true, data: { reference: 'CG-ABC234', clientSecret: 'pi_1_secret' } }), { status: 201 }));

beforeEach(() => {
    router.replace.mockClear();
    fetchMock.mockClear();
    vi.stubGlobal('fetch', fetchMock);
});

const page = () => render(
    <BookTeeTimeClient teeTimeId="t1" players={2} bookPath="/golf/wack-wack/book" extras={extras} summary={summary} />,
);

describe('BookTeeTimeClient', () => {
    it('lists the chosen extras and re-prices on the server when one changes', () => {
        page();
        expect(screen.getByText('Club rental × 1')).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText(/Golf cart/), { target: { value: '1' } });
        expect(router.replace).toHaveBeenCalledWith('/golf/wack-wack/book?teeTime=t1&players=2&extras=club_rental:1,cart:1', { scroll: false });
    });

    it('sends the chosen extras with the hold, then shows the card form', async () => {
        page();
        fireEvent.change(screen.getByLabelText(en.golf.booking.leadName), { target: { value: 'Ana Cruz' } });
        fireEvent.click(screen.getByRole('button', { name: en.golf.booking.continueToPayment }));
        expect(await screen.findByText('card form')).toBeInTheDocument();
        const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
        expect(JSON.parse(String(init.body))).toEqual({
            teeTimeId: 't1', players: 2, leadName: 'Ana Cruz', extras: [{ code: 'club_rental', quantity: 1 }],
        });
    });
});
```

Append to `src/lib/server/golf/emails.test.ts` inside `describe('buildGolfBookingEmail', …)`:
```ts
    it('lists each extra as its own line', () => {
        const { html } = buildGolfBookingEmail('requested', {
            ...booking, extrasTotal: 90, extras: [{ code: 'club_rental', quantity: 2, unitPrice: 45, total: 90 }],
        });
        expect(html).toContain('Club rental × 2');
        expect(html).toContain('90.00');
    });
```

- [x] **Step 3: Run, expect FAIL** — `npx vitest run "src/app/(main)/golf/[slug]/book" src/lib/server/golf/emails.test.ts`

- [x] **Step 4: Checkout page**

```tsx file=src/app/(main)/golf/[slug]/book/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { getAuthenticatedUser } from '@/lib/server/auth';
import { getBookableTeeTime } from '@/lib/server/golf/teeTimes';
import { listCourseExtras } from '@/lib/server/golf/extras';
import { golfServiceFee } from '@/lib/pricing';
import { convertCurrencyStrict, refreshExchangeRates } from '@/lib/currency';
import { freeCancelUntil } from '@/lib/golf/rules';
import { formatExtrasParam, parseExtrasParam, priceExtras, sanitizeExtras, type GolfExtraCode } from '@/lib/golf/extras';
import { formatMoney } from '@/components/golf/format';
import { BookTeeTimeClient } from './BookTeeTimeClient';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false } };

type Props = {
    params: Promise<{ slug: string }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Checkout for one tee time. Every figure here is the same function of the same numbers the hold
 * charges; choosing an extra changes the URL and this page prices it again.
 */
export default async function BookTeeTimePage({ params, searchParams }: Props) {
    const { slug } = await params;
    const query = await searchParams;
    const teeTimeId = typeof query.teeTime === 'string' ? query.teeTime : '';
    const players = Math.min(4, Math.max(1, Number.parseInt(typeof query.players === 'string' ? query.players : '', 10) || 2));
    const asked = parseExtrasParam(typeof query.extras === 'string' ? query.extras : undefined);

    const { user } = await getAuthenticatedUser();
    if (!user) {
        const extras = formatExtrasParam(asked);
        const back = `/golf/${slug}/book?teeTime=${encodeURIComponent(teeTimeId)}&players=${players}${extras ? `&extras=${extras}` : ''}`;
        redirect(`/login?next=${encodeURIComponent(back)}`);
    }

    const [t, tGolf, locale, bookable] = await Promise.all([
        getTranslations('golf.booking'), getTranslations('golf'), getLocale(), getBookableTeeTime(teeTimeId),
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
    const offers = await listCourseExtras(course.id);
    const chosen = sanitizeExtras(asked, offers, players);
    const priced = priceExtras(chosen, offers, players);
    const lines = priced.ok ? priced.lines : [];
    const extrasTotal = priced.ok ? priced.total : 0;

    const startsAt = new Date(teeTime.startsAt);
    const greenFee = round2(teeTime.pricePerPlayer * players);
    const base = round2(greenFee + extrasTotal);
    if (teeTime.currency !== 'USD') await refreshExchangeRates();
    const fee = golfServiceFee(base, teeTime.currency, convertCurrencyStrict);
    const total = round2(fee.chargedTotal);
    const money = (amount: number) => formatMoney(amount, teeTime.currency, locale);
    const extraName = (code: GolfExtraCode) => tGolf(`amenities.${code}`);
    const courseClock = (options: Intl.DateTimeFormatOptions, instant: Date) =>
        new Intl.DateTimeFormat(locale, { timeZone: course.timezone, ...options }).format(instant);
    // A tee time inside the course's free-cancellation window was never freely cancellable:
    // say so, rather than show a cutoff that is already behind us.
    const cutoff = freeCancelUntil(startsAt, course.freeCancelHours);
    const freeCancel = cutoff.getTime() > Date.now()
        ? t('freeCancel', { date: courseClock({ dateStyle: 'medium', timeStyle: 'short' }, cutoff) })
        : t('noFreeCancel');

    return (
        <BookTeeTimeClient
            teeTimeId={teeTime.id}
            players={players}
            bookPath={`/golf/${course.slug}/book`}
            extras={offers.map(offer => ({
                code: offer.code,
                name: extraName(offer.code),
                each: t('extraEach', { price: money(offer.price) }),
                quantity: chosen.find(c => c.code === offer.code)?.quantity ?? 0,
            }))}
            summary={{
                courseName: course.name,
                courseHref: `/golf/${course.slug}`,
                date: courseClock({ dateStyle: 'full' }, startsAt),
                time: t('courseTime', { time: teeTime.localTime }),
                greenFeeLabel: t('greenFee', { players, price: money(teeTime.pricePerPlayer) }),
                greenFee: money(greenFee),
                extraLines: lines.map(line => ({
                    label: t('extraLine', { name: extraName(line.code), count: line.quantity }),
                    amount: money(line.total),
                })),
                serviceFee: money(round2(total - base)),
                total: money(total),
                freeCancel,
            }}
        />
    );
}
```

- [x] **Step 5: Checkout client**

```tsx file=src/app/(main)/golf/[slug]/book/BookTeeTimeClient.tsx
'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import StripeEmbeddedCheckout from '@/components/checkout/StripeEmbeddedCheckout';
import { formatExtrasParam, type GolfExtraCode } from '@/lib/golf/extras';

export interface TeeTimeSummary {
    courseName: string;
    courseHref: string;
    date: string;
    time: string;
    greenFeeLabel: string;
    greenFee: string;
    /** One line per chosen extra. */
    extraLines: { label: string; amount: string }[];
    serviceFee: string;
    total: string;
    freeCancel: string;
}

export interface ExtraOption {
    code: GolfExtraCode;
    name: string;
    /** "$45.00 each" */
    each: string;
    quantity: number;
}

/**
 * Extras, the lead player's name, then the card. Choosing an extra changes the URL so the server
 * prices the whole booking again; the card is authorised, not charged, until the team confirms
 * with the course (CONTEXT.md, "Golf Booking").
 */
export function BookTeeTimeClient({ teeTimeId, players, bookPath, extras, summary }: {
    teeTimeId: string;
    players: number;
    bookPath: string;
    extras: ExtraOption[];
    summary: TeeTimeSummary;
}) {
    const t = useTranslations('golf.booking');
    const router = useRouter();
    const [repricing, startRepricing] = useTransition();
    const [leadName, setLeadName] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [payment, setPayment] = useState<{ reference: string; clientSecret: string } | null>(null);

    const chosen = extras.filter(e => e.quantity > 0).map(e => ({ code: e.code, quantity: e.quantity }));

    const choose = (code: GolfExtraCode, quantity: number) => {
        const param = formatExtrasParam(extras.map(e => ({ code: e.code, quantity: e.code === code ? quantity : e.quantity })));
        startRepricing(() => {
            router.replace(`${bookPath}?teeTime=${teeTimeId}&players=${players}${param ? `&extras=${param}` : ''}`, { scroll: false });
        });
    };

    const start = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const response = await fetch('/api/golf/bookings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'cheapestgo-client' },
                body: JSON.stringify({ teeTimeId, players, leadName, extras: chosen }),
            });
            const json = await response.json().catch(() => ({}));
            if (response.ok) setPayment({ reference: json.data.reference, clientSecret: json.data.clientSecret });
            else if (json.code === 'not_enough_spots') setError(t('notEnoughSpots', { count: json.spotsLeft ?? 0 }));
            else if (json.code === 'tee_time_unavailable') setError(t('unavailable'));
            else if (json.code === 'extras_unavailable') {
                setError(t('extrasUnavailable'));
                router.refresh();
            } else if (json.fieldErrors?.leadName) setError(t('leadNameRequired'));
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

                {extras.length > 0 && !payment && (
                    <section className="flex flex-col gap-3 rounded-xl border border-slate-200 p-5 dark:border-white/10" aria-busy={repricing}>
                        <div>
                            <h2 className="font-semibold text-slate-900 dark:text-slate-100">{t('extrasHeading')}</h2>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{t('extrasHint')}</p>
                        </div>
                        {extras.map(extra => (
                            <div key={extra.code} className="flex items-center justify-between gap-3">
                                <label htmlFor={`extra-${extra.code}`} className="text-sm">
                                    <span className="block font-medium text-slate-900 dark:text-slate-100">{extra.name}</span>
                                    <span className="block text-xs text-slate-500 dark:text-slate-400">{extra.each}</span>
                                </label>
                                <select id={`extra-${extra.code}`} value={extra.quantity} disabled={repricing}
                                    onChange={e => choose(extra.code, Number(e.target.value))}
                                    className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-slate-100">
                                    {Array.from({ length: players + 1 }, (_, n) => <option key={n} value={n}>{n}</option>)}
                                </select>
                            </div>
                        ))}
                    </section>
                )}

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
                        <button type="submit" disabled={busy || repricing}
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
                <dl className={`mt-4 flex flex-col gap-2 border-t border-slate-200 pt-4 tabular-nums text-slate-600 dark:border-white/10 dark:text-slate-300 ${repricing ? 'opacity-60' : ''}`}>
                    <div className={row}><dt>{summary.greenFeeLabel}</dt><dd>{summary.greenFee}</dd></div>
                    {summary.extraLines.map(line => (
                        <div key={line.label} className={row}><dt>{line.label}</dt><dd>{line.amount}</dd></div>
                    ))}
                    <div className={row}><dt>{t('serviceFee')}</dt><dd>{summary.serviceFee}</dd></div>
                    <div className={`${row} font-semibold text-slate-900 dark:text-slate-100`}><dt>{t('total')}</dt><dd>{summary.total}</dd></div>
                </dl>
                <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">{summary.freeCancel}</p>
            </aside>
        </main>
    );
}
```

- [x] **Step 6: Status page** — in `src/app/(main)/golf/bookings/[reference]/page.tsx`, the translations line becomes
```ts
    const [t, tGolf, locale] = await Promise.all([getTranslations('golf.booking'), getTranslations('golf'), getLocale()]);
```
and directly after the green-fee row (`…<dd>{money(booking.greenFeeTotal)}</dd></div>`) add:
```tsx
                    {booking.extras.map(extra => (
                        <div key={extra.code} className={row}>
                            <dt>{t('extraLine', { name: tGolf(`amenities.${extra.code}`), count: extra.quantity })}</dt>
                            <dd>{money(extra.total)}</dd>
                        </div>
                    ))}
```

- [x] **Step 7: Emails** — in `emails.ts` add `import { EXTRA_NAMES_EN } from '@/lib/golf/extras';` and, in `buildGolfBookingEmail`'s `rows`, directly after the `['Green fee', …]` entry:
```ts
        ...b.extras.map((e): [string, string] => [`${EXTRA_NAMES_EN[e.code]} × ${e.quantity}`, money(e.total, b.currency)]),
```

- [x] **Step 8: Run, expect PASS** — `npx vitest run "src/app/(main)/golf" src/lib/server/golf/emails.test.ts src/locales` and `npx tsc --noEmit -p .`

- [x] **Step 9: Commit** — `git add src/locales "src/app/(main)/golf" src/lib/server/golf/emails.ts src/lib/server/golf/emails.test.ts && git commit -m "feat(golf): customers choose extras at checkout; extras on the booking page and emails"`

---

### Task 6: Demo extras and live check

- [x] **Step 1: Demo offer** (local database only):
```bash
docker exec -i cheapest-go-app-postgres-1 sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
INSERT INTO golf_course_extras (course_id, code, price)
SELECT c.id, e.code, e.price FROM golf_courses c
 CROSS JOIN (VALUES ('club_rental', 45), ('caddie', 30), ('cart', 25)) AS e(code, price)
 WHERE c.slug LIKE 'demo-%'
ON CONFLICT (course_id, code) DO NOTHING;
SQL
```
Expected: `INSERT 0 12`.

- [ ] **Step 2: Live check on :3001** with a QA user and session (≥ 30-day expiry, cookie `cg-session`, email `delivered@resend.dev`): the checkout page for a demo tee time with `&extras=club_rental:2,cart:1` shows both lines and a total that includes them; `POST /api/golf/bookings` with those extras returns that total; the Stripe test-mode PaymentIntent amount equals it. Then delete the QA booking, user and session.

- [x] **Step 3: Full verification** — `npx tsc --noEmit -p .`, `npx vitest run`, the database test command on `src/lib/server/golf`, and `npx eslint` on the changed folders.
