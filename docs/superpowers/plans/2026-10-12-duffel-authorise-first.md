# Duffel authorise-first Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Authorise the traveller's card before the Duffel order is bought, then buy, then capture, behind a default-off flag, so a declined card never arrives after we have spent our own money.

**Architecture:** `/book` (flag on) creates a manual-capture intent and places no order. When the card is authorised, the Stripe webhook (or `/confirm`, as fallback) runs `finaliseDuffelAuthorised`: claim the session, place the order with the existing `place-duffel-order.ts` helper, capture or release. The legacy order-first code in `/book` is not rewritten; only small flag-gated edits are made to it. Spec: `docs/superpowers/specs/2026-10-12-duffel-authorise-first-design.md`.

**Tech Stack:** Next.js 15 route handlers, postgres.js (`getSqlAdmin`), Stripe SDK, Duffel REST, vitest, dbmate migrations.

**Conventions for every task**
- Work on branch `landing-sections`. Do not push.
- Run a single test file with `npx vitest run <path>`; run type-checking with `npx tsc --noEmit`.
- Every commit message ends with the line `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Use `git commit -m "<subject>" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"`.
- The flag is `DUFFEL_MANUAL_CAPTURE`; it is read with `process.env` in exactly one place (`resolveCaptureFlow`).
- Paths below are relative to the repository root.

---

## File structure

| File | Responsibility |
|---|---|
| `db/migrations/20261016000001_flights_authorise_first.sql` | `confirmed_price`, `failure` columns; `ordering` status |
| `src/lib/server/flights/capture-flow.ts` | read the flag once; read the stamp from intent metadata |
| `src/lib/server/flights/duffel-order-total.ts` | server-side order total from an offer |
| `src/lib/server/flights/duffel-order-passengers.ts` | E.164 phone, Duffel titles, order passenger objects |
| `src/lib/server/flights/duffel-order-errors.ts` | Duffel order failure to our error code and HTTP status |
| `src/lib/server/flights/flight-charge.ts` | markup + FX to a Stripe amount |
| `src/lib/server/flights/place-duffel-order.ts` | existing helper, made equivalent to `/book`'s inline logic |
| `src/lib/server/flights/authorised-outcome.ts` | shared types only |
| `src/lib/server/flights/finalise-authorised.ts` | claim, duplicate guard, order, capture, record |
| `src/lib/server/flights/failure-response.ts` | stored failure and finalise outcome to HTTP bodies |
| `src/lib/server/flights/post-booking.ts` | ticketing, email, ledger (moved out of the webhook file) |
| `src/lib/server/flights/auto-recover-filter.ts` | gains `decideAuthorisedRecovery` |
| `src/lib/flights/price-change-failure.ts` | client-side parse of a post-authorisation price change |

---

### Task 1: Migration

**Files:**
- Create: `db/migrations/20261016000001_flights_authorise_first.sql`

- [ ] **Step 1: Confirm the current status list**

Run: `Get-Content db/migrations/20260602000002_booking_sessions_status.sql`
Expected: a `CHECK` whose array includes `pending, initiated, payment_initiated, payment_authorized, processing, booked, failed, expired`. If it lists anything else, add those values to the array in Step 2.

- [ ] **Step 2: Write the migration**

```sql
-- migrate:up
-- Duffel flights: authorise the card first, then buy the ticket (ADR-0050).
--
-- confirmed_price: the bare fare the traveller last accepted. Kept on the session so the order
--   can be placed after authorisation under the same tolerance rule /book applies.
-- failure: why a session ended without a booking, as the traveller should be told it:
--   { "errorCode": "...", "priceChange": { "oldPrice": n, "newPrice": n, "currency": "..." } }.
--   NULL for every session that predates this column.
-- 'ordering': the session is claimed by the path that is placing the Duffel order.
ALTER TABLE public.booking_sessions
    ADD COLUMN IF NOT EXISTS confirmed_price numeric,
    ADD COLUMN IF NOT EXISTS failure jsonb;

ALTER TABLE public.booking_sessions DROP CONSTRAINT IF EXISTS booking_sessions_status_check;
ALTER TABLE public.booking_sessions ADD CONSTRAINT booking_sessions_status_check CHECK ((status = ANY (ARRAY[
    'pending'::text, 'initiated'::text, 'payment_initiated'::text, 'payment_authorized'::text,
    'ordering'::text, 'processing'::text, 'booked'::text, 'failed'::text, 'expired'::text
])));

-- migrate:down
UPDATE public.booking_sessions SET status = 'processing' WHERE status = 'ordering';
ALTER TABLE public.booking_sessions DROP CONSTRAINT IF EXISTS booking_sessions_status_check;
ALTER TABLE public.booking_sessions ADD CONSTRAINT booking_sessions_status_check CHECK ((status = ANY (ARRAY[
    'pending'::text, 'initiated'::text, 'payment_initiated'::text, 'payment_authorized'::text,
    'processing'::text, 'booked'::text, 'failed'::text, 'expired'::text
])));
ALTER TABLE public.booking_sessions
    DROP COLUMN IF EXISTS failure,
    DROP COLUMN IF EXISTS confirmed_price;
```

- [ ] **Step 3: Apply it to the local database**

Run (PowerShell, from the repo root):

```powershell
$line = Get-Content .env | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -First 1
$u = ($line -replace '^\s*DATABASE_URL\s*=\s*','').Trim().Trim('"',"'")
npx dbmate --url "${u}?sslmode=disable" --no-dump-schema up
```

Expected: `Applying: 20261016000001_flights_authorise_first.sql` then `Applied`.

- [ ] **Step 4: Verify**

Run:

```powershell
docker exec -i cheapest-go-app-postgres-1 sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tA -c "select column_name from information_schema.columns where table_name=''booking_sessions'' and column_name in (''confirmed_price'',''failure'') order by 1"'
```

Expected: two lines, `confirmed_price` and `failure`.

- [ ] **Step 5: Commit**

```bash
git add db/migrations/20261016000001_flights_authorise_first.sql
git commit -m "feat(flights): session columns and ordering status for authorise-first" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The flag and the stamp

**Files:**
- Create: `src/lib/server/flights/capture-flow.ts`
- Test: `src/lib/server/flights/capture-flow.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { resolveCaptureFlow, captureFlowOf } from './capture-flow';

describe('resolveCaptureFlow', () => {
    it('is order_first unless the flag is explicitly on', () => {
        expect(resolveCaptureFlow({})).toBe('order_first');
        expect(resolveCaptureFlow({ DUFFEL_MANUAL_CAPTURE: '' })).toBe('order_first');
        expect(resolveCaptureFlow({ DUFFEL_MANUAL_CAPTURE: 'true' })).toBe('order_first');
        expect(resolveCaptureFlow({ DUFFEL_MANUAL_CAPTURE: '1' })).toBe('order_first');
    });

    it('is authorise_first when the flag is on, ignoring case and whitespace', () => {
        expect(resolveCaptureFlow({ DUFFEL_MANUAL_CAPTURE: 'on' })).toBe('authorise_first');
        expect(resolveCaptureFlow({ DUFFEL_MANUAL_CAPTURE: ' ON ' })).toBe('authorise_first');
    });
});

describe('captureFlowOf', () => {
    it('reads the stamp the intent was created with', () => {
        expect(captureFlowOf({ captureFlow: 'authorise_first' })).toBe('authorise_first');
        expect(captureFlowOf({ captureFlow: 'order_first' })).toBe('order_first');
    });

    it('treats an intent with no stamp as order_first, so every older intent keeps its path', () => {
        expect(captureFlowOf({})).toBe('order_first');
        expect(captureFlowOf(null)).toBe('order_first');
        expect(captureFlowOf(undefined)).toBe('order_first');
        expect(captureFlowOf({ provider: 'mystifly_v2' })).toBe('order_first');
    });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run src/lib/server/flights/capture-flow.test.ts`
Expected: FAIL, "Failed to resolve import './capture-flow'".

- [ ] **Step 3: Implement**

```ts
export type CaptureFlow = 'order_first' | 'authorise_first';

/**
 * Whether new Duffel bookings authorise the card before the order is bought.
 *
 * Read once, when /book creates the PaymentIntent, and stamped on the intent as `captureFlow`.
 * Everything after that routes by the stamp (see captureFlowOf), never by this flag, so turning
 * the flag off cannot strand a payment that is already in flight.
 */
export function resolveCaptureFlow(env: Record<string, string | undefined> = process.env): CaptureFlow {
    return env.DUFFEL_MANUAL_CAPTURE?.trim().toLowerCase() === 'on' ? 'authorise_first' : 'order_first';
}

/** The flow an intent was created under. No stamp means it predates the flag: order first. */
export function captureFlowOf(metadata: Record<string, string> | null | undefined): CaptureFlow {
    return metadata?.captureFlow === 'authorise_first' ? 'authorise_first' : 'order_first';
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `npx vitest run src/lib/server/flights/capture-flow.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/flights/capture-flow.ts src/lib/server/flights/capture-flow.test.ts
git commit -m "feat(flights): capture-flow flag and intent stamp" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Order total and order passengers

**Files:**
- Create: `src/lib/server/flights/duffel-order-total.ts`
- Create: `src/lib/server/flights/duffel-order-passengers.ts`
- Test: `src/lib/server/flights/duffel-order-total.test.ts`
- Test: `src/lib/server/flights/duffel-order-passengers.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/lib/server/flights/duffel-order-total.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeOrderTotal } from './duffel-order-total';

const OFFER = {
    total_amount: '100.00',
    available_services: [
        { id: 'ase_seat', total_amount: '12.50' },
        { id: 'ase_bag', total_amount: '20.00' },
    ],
};

describe('computeOrderTotal', () => {
    it('is the bare fare when nothing is selected', () => {
        expect(computeOrderTotal(OFFER, undefined, undefined)).toEqual({ total: '100.00', base: 100, seatExtra: 0, bagExtra: 0 });
    });

    it('adds the offer\'s own prices for the selected seats and bags', () => {
        expect(computeOrderTotal(OFFER, ['ase_seat'], ['ase_bag'])).toEqual({ total: '132.50', base: 100, seatExtra: 12.5, bagExtra: 20 });
    });

    it('leaves out a service the offer does not list, rather than trusting the caller', () => {
        expect(computeOrderTotal(OFFER, ['ase_unknown'], undefined).total).toBe('100.00');
    });

    it('is 0.00 for an offer with no total', () => {
        expect(computeOrderTotal({}, undefined, undefined).total).toBe('0.00');
    });
});
```

`src/lib/server/flights/duffel-order-passengers.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildDuffelOrderPassengers, duffelTitle, toE164Phone } from './duffel-order-passengers';

describe('toE164Phone', () => {
    it('joins the country code and the number, dropping punctuation and leading zeros', () => {
        expect(toE164Phone({ countryCode: '82', phone: '010-1234-5678' })).toEqual({ ok: true, e164: '+821012345678' });
        expect(toE164Phone({ countryCode: '+63', phone: '917 123 4567' })).toEqual({ ok: true, e164: '+639171234567' });
    });

    it('falls back to the default country code', () => {
        expect(toE164Phone({ phone: '10-1234-5678' })).toEqual({ ok: true, e164: '+821012345678' });
        expect(toE164Phone({ phone: '917 123 4567' }, '63')).toEqual({ ok: true, e164: '+639171234567' });
    });

    it('rejects a number that is too short to be real', () => {
        expect(toE164Phone({ countryCode: '82', phone: '123' })).toEqual({ ok: false });
        expect(toE164Phone({ countryCode: '82', phone: '' })).toEqual({ ok: false });
    });
});

describe('duffelTitle', () => {
    it('follows type and gender', () => {
        expect(duffelTitle({ gender: 'M', type: 'ADT' })).toBe('mr');
        expect(duffelTitle({ gender: 'F', type: 'ADT' })).toBe('ms');
        expect(duffelTitle({ gender: 'M', type: 'CHD' })).toBe('mr');
        expect(duffelTitle({ gender: 'F', type: 'INF' })).toBe('miss');
    });
});

describe('buildDuffelOrderPassengers', () => {
    it('maps submitted passengers onto the offer\'s passenger ids, in order', () => {
        const result = buildDuffelOrderPassengers({
            passengers: [
                { firstName: 'Ana', lastName: 'Cruz', birthDate: '1990-01-01', gender: 'F', type: 'ADT' },
                { firstName: 'Ben', lastName: 'Cruz', birthDate: '2015-05-05', gender: 'M', type: 'CHD' },
            ],
            contact: { email: 'ana@example.com' },
            rawOffer: { passengers: [{ id: 'pas_1' }, { id: 'pas_2' }] },
            e164: '+821012345678',
        });

        expect(result).toHaveLength(2);
        expect(result[0]).toMatchObject({
            id: 'pas_1', title: 'ms', given_name: 'Ana', family_name: 'Cruz', born_on: '1990-01-01',
            email: 'ana@example.com', phone_number: '+821012345678', gender: 'f',
        });
        expect(result[1]).toMatchObject({ id: 'pas_2', title: 'mr', given_name: 'Ben', gender: 'm' });
    });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run src/lib/server/flights/duffel-order-total.test.ts src/lib/server/flights/duffel-order-passengers.test.ts`
Expected: FAIL, both modules unresolved.

- [ ] **Step 3: Implement the total**

`src/lib/server/flights/duffel-order-total.ts`:

```ts
export interface OrderTotal {
    /** Base fare plus selected services, fixed to 2 decimals, as Duffel's `payments.amount` wants it. */
    total: string;
    base: number;
    seatExtra: number;
    bagExtra: number;
}

/**
 * The amount to pay Duffel for an offer plus the selected ancillaries.
 *
 * Service prices come from `available_services` on the offer itself, never from the client's
 * seat/bag totals: Duffel validates `payments.amount` against its own arithmetic and rejects a
 * mismatch, and a client-supplied number could understate what the card is asked for.
 */
export function computeOrderTotal(
    rawOffer: any,
    seatServiceIds: string[] | undefined,
    bagServiceIds: string[] | undefined,
): OrderTotal {
    const base = parseFloat(rawOffer?.total_amount ?? '0') || 0;
    const available: any[] = rawOffer?.available_services ?? [];

    const sumFor = (ids: string[] | undefined) =>
        (ids ?? []).reduce((sum, id) => {
            const svc = available.find(s => s.id === id);
            return svc ? sum + (parseFloat(svc.total_amount ?? '0') || 0) : sum;
        }, 0);

    const seatExtra = sumFor(seatServiceIds);
    const bagExtra = sumFor(bagServiceIds);
    return { total: (base + seatExtra + bagExtra).toFixed(2), base, seatExtra, bagExtra };
}
```

- [ ] **Step 4: Implement the passengers**

`src/lib/server/flights/duffel-order-passengers.ts`:

```ts
import { duffelIdentityDocuments } from './duffel-identity-documents';

export type E164Result = { ok: true; e164: string } | { ok: false };

/**
 * Normalise a contact phone to E.164, or say it cannot be.
 *
 * The country code is digits only ("+82", "82" and "0082" agree); the number has non-digits and
 * leading zeros removed (Korean "010-…" becomes "10…"). Duffel rejects an order over a bad
 * number, so this runs before a card is authorised, not after.
 */
export function toE164Phone(
    contact: { countryCode?: unknown; phone?: unknown },
    defaultCountryCode = '82',
): E164Result {
    const countryCode = String(contact.countryCode ?? defaultCountryCode).replace(/\D/g, '') || defaultCountryCode;
    const subscriber = String(contact.phone ?? '').replace(/\D/g, '').replace(/^0+/, '');
    const e164 = `+${countryCode}${subscriber}`;
    const digits = countryCode.length + subscriber.length;
    if (subscriber.length < 4 || digits < 7 || !/^\+\d{7,15}$/.test(e164)) return { ok: false };
    return { ok: true, e164 };
}

/** Duffel's title vocabulary is mr | ms | mrs | miss | dr. */
export function duffelTitle(pax: { gender?: string; type?: string }): string {
    const g = (pax.gender ?? '').toUpperCase();
    const t = (pax.type ?? '').toUpperCase();
    if (t === 'CHD' || t === 'INF') return g === 'M' ? 'mr' : 'miss';
    return g === 'M' ? 'mr' : 'ms';
}

/** The `passengers` array of an order body: submitted details on the offer's passenger ids. */
export function buildDuffelOrderPassengers({ passengers, contact, rawOffer, e164 }: {
    passengers: any[];
    contact: { email?: string };
    rawOffer: any;
    e164: string;
}): any[] {
    const templates: any[] = rawOffer?.passengers ?? [];
    return passengers.map((pax, idx) => ({
        id: templates[idx]?.id,
        title: duffelTitle(pax),
        given_name: pax.firstName,
        family_name: pax.lastName,
        born_on: pax.birthDate,
        email: contact.email,
        phone_number: e164,
        gender: (pax.gender ?? '').toUpperCase() === 'M' ? 'm' : 'f',
        // Passport details for the airline's APIS feed, when the offer asks for them.
        ...duffelIdentityDocuments(rawOffer, pax),
    }));
}
```

- [ ] **Step 5: Run and see them pass**

Run: `npx vitest run src/lib/server/flights/duffel-order-total.test.ts src/lib/server/flights/duffel-order-passengers.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/flights/duffel-order-total.ts src/lib/server/flights/duffel-order-total.test.ts src/lib/server/flights/duffel-order-passengers.ts src/lib/server/flights/duffel-order-passengers.test.ts
git commit -m "feat(flights): shared order total and order passenger builders" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Order failure mapping

**Files:**
- Create: `src/lib/server/flights/duffel-order-errors.ts`
- Test: `src/lib/server/flights/duffel-order-errors.test.ts`

This is `/book`'s error mapper (route.ts 1368–1424) as a pure function. `/book` keeps its own copy until the legacy path is deleted.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { mapDuffelOrderFailure } from './duffel-order-errors';

const err = (code: string, message = '') => ({ errors: [{ code, message }], meta: { request_id: 'req_1' } });

describe('mapDuffelOrderFailure', () => {
    it('reports an expired offer as flight_unavailable', () => {
        expect(mapDuffelOrderFailure(422, err('offer_no_longer_available'))).toMatchObject({
            errorCode: 'flight_unavailable', httpStatus: 409, duffelCode: 'offer_no_longer_available', requestId: 'req_1',
        });
    });

    it('does not call every 422 an expired fare', () => {
        const result = mapDuffelOrderFailure(422, err('validation_error', 'passport number is invalid'));
        expect(result.errorCode).toBeNull();
        expect(result.httpStatus).toBe(400);
        expect(result.error).toBe('passport number is invalid');
    });

    it('maps balance, phone, seat and outage failures', () => {
        expect(mapDuffelOrderFailure(422, err('insufficient_balance'))).toMatchObject({ errorCode: 'balance_insufficient', httpStatus: 503 });
        expect(mapDuffelOrderFailure(422, err('validation_error', 'phone_number is invalid'))).toMatchObject({ errorCode: 'phone_number_invalid', httpStatus: 400 });
        expect(mapDuffelOrderFailure(422, err('x', 'selected seat service unavailable'))).toMatchObject({ errorCode: 'seats_unavailable', httpStatus: 400 });
        expect(mapDuffelOrderFailure(504, err('timeout'))).toMatchObject({ errorCode: 'supplier_outage', httpStatus: 502 });
    });

    it('checks balance before expiry, since both can arrive as 422', () => {
        const result = mapDuffelOrderFailure(422, err('insufficient_balance', 'offer expired, insufficient balance'));
        expect(result.errorCode).toBe('balance_insufficient');
    });

    it('survives a body with no errors array', () => {
        expect(mapDuffelOrderFailure(500, null)).toMatchObject({ errorCode: 'supplier_outage', httpStatus: 502 });
        expect(mapDuffelOrderFailure(400, {})).toMatchObject({ errorCode: null, httpStatus: 400, error: 'Flight booking failed. Please try again.' });
    });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run src/lib/server/flights/duffel-order-errors.test.ts`
Expected: FAIL, module unresolved.

- [ ] **Step 3: Implement**

```ts
export type OrderErrorCode =
    | 'phone_number_invalid'
    | 'balance_insufficient'
    | 'flight_unavailable'
    | 'seats_unavailable'
    | 'supplier_outage';

export interface OrderFailure {
    /** Our bucket. Several Duffel codes collapse into each one. */
    errorCode: OrderErrorCode | null;
    httpStatus: number;
    /** Duffel's own wording, only when we have no code of our own. */
    error?: string;
    /** Duffel's code, echoed for diagnosis. */
    duffelCode?: string;
    requestId?: string;
}

const EXPIRED_CODES = new Set(['offer_no_longer_available', 'offer_expired', 'offer_request_not_found', 'not_found']);

/**
 * Turn a refused `POST /air/orders` into one of our codes.
 *
 * Match on Duffel's error code, not the bare 422: Duffel answers 422 for every rejected order,
 * an expired offer but equally a malformed passport number. A balance error is checked before
 * expiry because both arrive as 422 and only one of them is the fare's fault.
 */
export function mapDuffelOrderFailure(status: number, data: any): OrderFailure {
    const first = data?.errors?.[0];
    const rawMessage: string = first?.message ?? '';
    const code: string = first?.code ?? '';
    const requestId: string = data?.meta?.request_id ?? '';

    const isPhone = /phone_number/i.test(rawMessage);
    const isBalance = code === 'insufficient_balance' || /insufficient.*balance|balance.*insufficient/i.test(rawMessage);
    const isExpired = !isBalance && (EXPIRED_CODES.has(code) || /expired|no longer available|select another offer/i.test(rawMessage));
    const isSeat = /seat|service.*unavailable|no longer.*available.*service/i.test(rawMessage) && !isExpired && !isBalance;
    const isOutage = status >= 500;

    let errorCode: OrderErrorCode | null = null;
    if (isPhone) errorCode = 'phone_number_invalid';
    else if (isBalance) errorCode = 'balance_insufficient';
    else if (isExpired) errorCode = 'flight_unavailable';
    else if (isSeat) errorCode = 'seats_unavailable';
    else if (isOutage) errorCode = 'supplier_outage';

    let httpStatus = 400;
    if (isBalance) httpStatus = 503;
    else if (isExpired) httpStatus = 409;
    else if (isOutage) httpStatus = 502;

    return {
        errorCode,
        httpStatus,
        error: isBalance
            ? 'Flight booking is temporarily unavailable. Please try again shortly.'
            : errorCode ? undefined : (rawMessage || 'Flight booking failed. Please try again.'),
        duffelCode: code || undefined,
        requestId: requestId || undefined,
    };
}
```

- [ ] **Step 4: Run and see it pass**

Run: `npx vitest run src/lib/server/flights/duffel-order-errors.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/flights/duffel-order-errors.ts src/lib/server/flights/duffel-order-errors.test.ts
git commit -m "feat(flights): map a refused Duffel order to our error codes" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Make `place-duffel-order.ts` equivalent to `/book`'s inline logic

The helper is currently imported by the mobile route and never called. The new path will rely on it, so four differences from `/book` are fixed here first, test-first. `/book` is not edited.

**Files:**
- Modify: `src/lib/server/flights/place-duffel-order.ts`
- Test: `src/lib/server/flights/place-duffel-order.test.ts`

- [ ] **Step 1: Add the failing tests**

Append to `src/lib/server/flights/place-duffel-order.test.ts` (the file's existing `duffel()` helper, `RAW_OFFER`, `PAX` and `PRICE_ACTION` stay as they are):

```ts
// ── Equivalence with /api/flights/book ──────────────────────────────────────────

const segment = (over: Record<string, unknown> = {}) => ({
    marketing_carrier: { iata_code: 'EK' },
    marketing_carrier_flight_number: '332',
    origin: { iata_code: 'MNL' },
    destination: { iata_code: 'ICN' },
    departing_at: '2026-11-20T08:00:00',
    ...over,
});

/** An offer with a real itinerary, so refresh and reconciliation have something to compare. */
const offerFor = (id: string, total: string, segmentOver: Record<string, unknown> = {}) => ({
    id,
    total_amount: total,
    total_currency: 'USD',
    passengers: [{ id: 'pas_1' }],
    slices: [{
        origin: { iata_code: 'MNL' }, destination: { iata_code: 'ICN' },
        segments: [segment(segmentOver)],
    }],
});

const inOrder = (...responses: Array<{ status: number; body: unknown }>) => {
    let i = 0;
    return () => responses[Math.min(i++, responses.length - 1)];
};

describe('placeDuffelOrder — matches what /book does', () => {
    afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

    it('adopts the raw order a timed-out attempt created, instead of reading fields it does not have', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});

        vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
            const method = init?.method ?? 'GET';
            if (method === 'POST' && url.endsWith('/air/orders')) {
                // Never answers; only the abort ends it.
                return new Promise<Response>((_, reject) => {
                    init!.signal!.addEventListener('abort', () =>
                        reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
                });
            }
            if (method === 'GET' && url.startsWith('https://api.duffel.com/air/orders?limit=50')) {
                return new Response(JSON.stringify({ data: [{
                    id: 'ord_late', booking_reference: 'ABC123',
                    created_at: new Date(Date.now() + 1000).toISOString(),
                    total_amount: '100.00', total_currency: 'USD',
                    slices: [{ origin: { iata_code: 'MNL' }, destination: { iata_code: 'ICN' } }],
                    passengers: [{ family_name: 'Sandbox' }],
                    documents: [{ type: 'electronic_ticket', unique_identifier: '1234567890123' }],
                }] }), { status: 200 });
            }
            return new Response('{}', { status: 404 });
        }));

        const result = await placeDuffelOrder({
            duffelToken: 'duffel_test_abc', rawOffer: offerFor('off_1', '100.00'), passengers: PAX,
            total: '100.00', currency: 'USD', priceTolerance: 0.5, idempotencyKey: 'idem-t', orderTimeoutMs: 10,
        });

        expect(result.kind).toBe('success');
        if (result.kind === 'success') {
            expect(result.order.id).toBe('ord_late');
            expect(result.order.booking_reference).toBe('ABC123');
        }
    });

    it('re-quotes only offers for the same flights, not the one nearest in price', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const orders = duffel([
            ['POST', '/air/orders', inOrder(
                { status: 422, body: { errors: [{ code: 'offer_no_longer_available' }] } },
                { status: 201, body: { data: { id: 'ord_ok' } } },
            )],
            ['POST', '/air/offer_requests', () => ({ status: 201, body: { data: { id: 'orq_1', offers: [
                offerFor('off_other_flight', '100.50', { departing_at: '2026-11-20T22:00:00' }),
                offerFor('off_same_flight', '104.00'),
            ] } } })],
        ]);

        const result = await placeDuffelOrder({
            duffelToken: 'duffel_test_abc', rawOffer: offerFor('off_1', '100.00'), passengers: PAX,
            total: '100.00', currency: 'USD', priceTolerance: 10, idempotencyKey: 'idem-p',
        });

        expect(result.kind).toBe('success');
        expect(orders[1].selected_offers).toEqual(['off_same_flight']);
    });

    it('says unavailable when no offer is the same journey, rather than substituting one', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const orders = duffel([
            ['POST', '/air/orders', () => ({ status: 422, body: { errors: [{ code: 'offer_no_longer_available' }] } })],
            ['POST', '/air/offer_requests', () => ({ status: 201, body: { data: { id: 'orq_1', offers: [
                offerFor('off_other_flight', '100.50', { departing_at: '2026-11-20T22:00:00' }),
            ] } } })],
        ]);

        const result = await placeDuffelOrder({
            duffelToken: 'duffel_test_abc', rawOffer: offerFor('off_1', '100.00'), passengers: PAX,
            total: '100.00', currency: 'USD', priceTolerance: 10, idempotencyKey: 'idem-n',
        });

        expect(result.kind).toBe('error');
        // The caller maps this failure to a code, so it has to say why we were refreshing.
        if (result.kind === 'error') {
            expect(result.status).toBe(422);
            expect(result.data?.errors?.[0]?.code).toBe('offer_no_longer_available');
        }
        expect(orders).toHaveLength(1);
    });

    it('reports a price change in bare fares, with ancillaries kept out of it', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        duffel([
            ['POST', '/air/orders', () => ({ status: 422, body: { errors: [{ code: 'price_changed', source: { offer_id: 'off_1' } }] } })],
            ['POST', '/air/offers/off_1/actions/price', () => ({ status: 200, body: { data: { id: 'off_1', total_amount: '150.00', total_currency: 'USD', available_services: [] } } })],
            ['GET', '/air/offers/off_1?return_available_services=true', () => ({ status: 200, body: { data: { id: 'off_1', available_services: [{ id: 'ase_bag', type: 'baggage', total_amount: '20.00' }] } } })],
        ]);

        const result = await placeDuffelOrder({
            duffelToken: 'duffel_test_abc', rawOffer: RAW_OFFER, passengers: PAX, total: '120.00', currency: 'USD',
            bagServiceIds: ['ase_bag'], priceTolerance: 10, idempotencyKey: 'idem-b',
        });

        // 100 -> 150 is the fare. The 20 bag is on both sides and is not part of the change.
        expect(result).toEqual({ kind: 'price_changed', oldPrice: 100, newPrice: 150, currency: 'USD' });
    });

    it('still reports a price change when the retries are spent and the order keeps being refused', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        duffel([
            ['POST', '/air/orders', () => ({ status: 422, body: { errors: [{ code: 'price_changed', source: { offer_id: 'off_1' } }] } })],
            ['POST', '/air/offers/off_1/actions/price', () => ({ status: 200, body: { data: { id: 'off_1', total_amount: '100.50', total_currency: 'USD', available_services: [] } } })],
        ]);

        const result = await placeDuffelOrder({
            duffelToken: 'duffel_test_abc', rawOffer: RAW_OFFER, passengers: PAX, total: '100.00', currency: 'USD',
            priceTolerance: 10, idempotencyKey: 'idem-u',
        });

        expect(result).toEqual({ kind: 'price_changed', oldPrice: 100, newPrice: 100.5, currency: 'USD' });
    });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run src/lib/server/flights/place-duffel-order.test.ts`
Expected: the two original tests PASS; the five new tests FAIL (the first throws a TypeError on `recovered.tickets.map`, the pool tests select the wrong offer or find none, the price tests report totals).

- [ ] **Step 3: Apply these edits to `src/lib/server/flights/place-duffel-order.ts`**

Edit 1, import. Replace:

```ts
import { withDuffelServicePrices } from './duffel-service-prices';
```

with:

```ts
import { withDuffelServicePrices } from './duffel-service-prices';
import { sameItineraryOffers } from './offer-itinerary-match';
```

Edit 2, `tryPlaceOrder` takes the bare fare. Replace:

```ts
    const tryPlaceOrder = async (
        offerId: string,
        paxList: any[],
        total: string,
        currency: string,
        includeServices: boolean,
        key: string,
    ): Promise<TryPlaceOrderResult> => {
        let currentTotal = total;
        let currentCurrency = currency;
```

with:

```ts
    const tryPlaceOrder = async (
        offerId: string,
        paxList: any[],
        total: string,
        baseAmount: number,
        currency: string,
        includeServices: boolean,
        key: string,
    ): Promise<TryPlaceOrderResult> => {
        let currentTotal = total;
        // The bare fare behind `total`. Price changes are reported in bare fares so the number a
        // traveller confirms is the same unit the next attempt compares against.
        let currentBase = baseAmount;
        let currentCurrency = currency;
```

Edit 3, adopt the raw order from timeout reconciliation. Replace:

```ts
                    console.warn(`[placeDuffelOrder] Timed-out attempt succeeded — adopting order ${recovered.orderId} (${recovered.pnr})`);
                    return {
                        isPriceChangedError: false,
                        isOfferUnavailable: false,
                        res: new Response(null, { status: 200 }),
                        data: { data: { id: recovered.orderId, booking_reference: recovered.pnr, documents: recovered.tickets.map((t: string) => ({ type: 'electronic_ticket', unique_identifier: t })) } },
```

with:

```ts
                    // `findOrderFromTimedOutAttempt` resolves to the RAW Duffel order, which is the
                    // shape a normal 201 carries, so it goes back unchanged.
                    console.warn(`[placeDuffelOrder] Timed-out attempt succeeded — adopting order ${recovered.id} (${recovered.booking_reference})`);
                    return {
                        isPriceChangedError: false,
                        isOfferUnavailable: false,
                        res: new Response(null, { status: 200 }),
                        data: { data: recovered },
```

Edit 4, report bare fares and remember the new base. Replace:

```ts
            if (priceDelta > priceTolerance && !priceAlreadyConfirmed) {
                return { isPriceChangedError: true, isOfferUnavailable: false, oldPrice: oldTotalNum, newPrice: newTotalNum, newCurrency: currentCurrency };
            }

            currentTotal = newTotalNum.toFixed(2);
```

with:

```ts
            if (priceDelta > priceTolerance && !priceAlreadyConfirmed) {
                return { isPriceChangedError: true, isOfferUnavailable: false, oldPrice: currentBase, newPrice: freshBase, newCurrency: currentCurrency };
            }

            currentTotal = newTotalNum.toFixed(2);
            currentBase = freshBase;
```

Edit 5, a price change still unresolved when the retries are spent. Replace:

```ts
        return { isPriceChangedError: false, isOfferUnavailable: false, res, data, finalTotal: currentTotal, finalCurrency: currentCurrency };
    };
```

with:

```ts
        // Still price_changed after the retries, with a Price Action that did produce a new number:
        // report it, so the traveller can accept the new fare. A "100 changed to 100" prompt is
        // worse than none, hence the comparison.
        if (
            res.status === 422
            && data?.errors?.[0]?.code === 'price_changed'
            && Math.abs(currentBase - baseAmount) > 0.005
        ) {
            return { isPriceChangedError: true, isOfferUnavailable: false, oldPrice: baseAmount, newPrice: currentBase, newCurrency: currentCurrency };
        }

        return { isPriceChangedError: false, isOfferUnavailable: false, res, data, finalTotal: currentTotal, finalCurrency: currentCurrency };
    };
```

Edit 6, first attempt passes the bare fare. Replace:

```ts
    const attempt1 = await tryPlaceOrder(rawOffer.id, params.passengers, params.total, params.currency, true, idempotencyKey);
```

with:

```ts
    const attempt1 = await tryPlaceOrder(rawOffer.id, params.passengers, params.total, parseFloat(rawOffer.total_amount ?? '0'), params.currency, true, idempotencyKey);
```

Edit 7, the refresh pool is the same journey. Replace:

```ts
        const targetCarrier = rawOffer.validating_carrier_iata_code
            ?? rawOffer.slices?.[0]?.segments?.[0]?.operating_carrier?.iata_code
            ?? rawOffer.slices?.[0]?.segments?.[0]?.marketing_carrier?.iata_code;
        const targetTotal = parseFloat(rawOffer.total_amount ?? '0');

        const matchingOffers = targetCarrier
            ? offers.filter((o: any) => {
                const carrier = o.validating_carrier_iata_code
                    ?? o.slices?.[0]?.segments?.[0]?.operating_carrier?.iata_code
                    ?? o.slices?.[0]?.segments?.[0]?.marketing_carrier?.iata_code;
                return carrier === targetCarrier;
            })
            : offers;

        const sortedPool = (matchingOffers.length > 0 ? matchingOffers : offers).sort((a: any, b: any) =>
            Math.abs(parseFloat(a.total_amount) - targetTotal) - Math.abs(parseFloat(b.total_amount) - targetTotal),
        );
```

with:

```ts
        // Only offers for the SAME journey: same marketing carrier, flight numbers and departure
        // instants, segment by segment, cheapest first. A carrier-and-nearest-price match can ticket
        // a traveller onto a flight sixteen hours from the one they chose. Nothing matching means
        // unavailable: substituting a different flight is not a recovery.
        const sortedPool = sameItineraryOffers(rawOffer, offers);
        if (sortedPool.length === 0) return { kind: 'error', status: 422, data: attempt1.data };
```

Edit 8, refresh attempt passes the bare fare. Replace:

```ts
            const attempt2 = await tryPlaceOrder(freshOffer.id, refreshedPassengers, freshBaseTotal.toFixed(2), freshOffer.total_currency, false, crypto.randomUUID());
```

with:

```ts
            const attempt2 = await tryPlaceOrder(freshOffer.id, refreshedPassengers, freshBaseTotal.toFixed(2), freshBaseTotal, freshOffer.total_currency, false, crypto.randomUUID());
```

Edit 9a, an expired offer with nothing to re-quote must still read as unavailable. When the first attempt was refused as `offer_no_longer_available`, `attempt1.data` is undefined, so every error returned from the refresh section would reach the caller with no code and be reported as a generic failure (`/book` supplies that code itself at line 1188). Immediately before the comment `// ── Auto-refresh: the offer expired — re-quote fresh offers for the same carrier ──`, add:

```ts
    // The first attempt was refused as "gone" without a body to show for it. Whatever the refresh
    // comes to, a caller mapping the failure must still see why we were here.
    const refreshFailureData = attempt1.data ?? {
        errors: [{ code: 'offer_no_longer_available', message: 'The offer is no longer available' }],
    };
```

then, in the refresh section only (everything after that comment, inside the `try` and `catch`), replace every `status: 422, data: attempt1.data` with `status: 422, data: refreshFailureData`. Leave `return { kind: 'error', status: attempt1.res.status, data: attempt1.data };` (the non-422 hard error above it) as it is.

Edit 9, the header note. Replace:

```ts
 * NOTE: the web /api/flights/book route still has its own inline copy of this logic.
 * It should be migrated onto this helper in a follow-up (with sandbox QA) so the two
 * booking paths can't drift.
```

with:

```ts
 * NOTE: the web /api/flights/book route keeps its own inline copy of this logic for the
 * order-first flow, which is to be deleted rather than migrated. This helper is what the
 * authorise-first flow (finalise-authorised.ts) places orders with, so it is kept equivalent
 * to that copy: same-itinerary refresh pool, bare-fare price reporting, raw-order adoption
 * after a timeout, and a price change still unresolved after the retries is reported.
```

- [ ] **Step 4: Run and see them pass**

Run: `npx vitest run src/lib/server/flights/place-duffel-order.test.ts`
Expected: PASS, 7 tests (2 original, 5 new).

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no output. (The mobile route imports the helper but does not call it, so nothing else changes.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/flights/place-duffel-order.ts src/lib/server/flights/place-duffel-order.test.ts
git commit -m "fix(flights): make the order helper match /book before anything relies on it" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The charge for a fare

**Files:**
- Create: `src/lib/server/flights/flight-charge.ts`
- Test: `src/lib/server/flights/flight-charge.test.ts`

This is the arithmetic `/book` applies at lines 1500–1546 (markup on the supplier total, flat component converted from USD, then conversion into the charge currency), lifted out so the authorisation amount and the capture amount are computed the same way.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/currency', () => {
    const rates: Record<string, number> = { USD: 1, PHP: 58, KRW: 1350 };
    return {
        convertCurrencyStrict: (amount: number, from: string, to: string) => {
            const f = rates[from.toUpperCase()];
            const t = rates[to.toUpperCase()];
            if (!f || !t) throw new Error(`no rate ${from}->${to}`);
            return (amount / f) * t;
        },
    };
});

import { applyMarkup, FLIGHT_MARKUP_SPEC, toStripeAmount } from '@/lib/pricing';
import { quoteFlightCharge } from './flight-charge';

describe('quoteFlightCharge', () => {
    it('is the marked-up price when the charge currency is the supplier currency', () => {
        const expected = applyMarkup(100, FLIGHT_MARKUP_SPEC, FLIGHT_MARKUP_SPEC.flat);
        const charge = quoteFlightCharge({ baseTotal: 100, baseCurrency: 'USD', chargeCurrency: 'usd' });

        expect(charge.chargePrice).toBe(expected.chargedPrice);
        expect(charge.stripeAmount).toBe(toStripeAmount(expected.chargedPrice, 'usd'));
        expect(charge.originalPrice).toBe(100);
    });

    it('converts the marked-up price into the traveller\'s currency, in that currency\'s units', () => {
        const marked = applyMarkup(100, FLIGHT_MARKUP_SPEC, FLIGHT_MARKUP_SPEC.flat).chargedPrice;
        const charge = quoteFlightCharge({ baseTotal: 100, baseCurrency: 'USD', chargeCurrency: 'php' });

        expect(charge.chargePrice).toBe(Math.round(marked * 58 * 100) / 100);
        expect(charge.stripeAmount).toBe(Math.round(charge.chargePrice * 100));
    });

    it('uses whole units for a zero-decimal currency', () => {
        const charge = quoteFlightCharge({ baseTotal: 100, baseCurrency: 'USD', chargeCurrency: 'krw' });
        expect(Number.isInteger(charge.stripeAmount)).toBe(true);
    });

    it('converts the USD flat component into the supplier currency before adding it', () => {
        const flatInPhp = FLIGHT_MARKUP_SPEC.flat * 58;
        const expected = applyMarkup(5800, FLIGHT_MARKUP_SPEC, flatInPhp);
        const charge = quoteFlightCharge({ baseTotal: 5800, baseCurrency: 'PHP', chargeCurrency: 'php' });
        expect(charge.chargePrice).toBe(expected.chargedPrice);
    });

    it('drops the flat component rather than failing when it cannot be converted', () => {
        const expected = applyMarkup(100, FLIGHT_MARKUP_SPEC, 0);
        const charge = quoteFlightCharge({ baseTotal: 100, baseCurrency: 'XXX', chargeCurrency: 'xxx' });
        expect(charge.chargePrice).toBe(expected.chargedPrice);
    });

    it('throws when the charge currency itself cannot be converted into', () => {
        expect(() => quoteFlightCharge({ baseTotal: 100, baseCurrency: 'USD', chargeCurrency: 'xxx' })).toThrow();
    });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run src/lib/server/flights/flight-charge.test.ts`
Expected: FAIL, module unresolved.

- [ ] **Step 3: Implement**

```ts
import { applyMarkup, toStripeAmount, FLIGHT_MARKUP_SPEC } from '@/lib/pricing';
import { convertCurrencyStrict } from '@/lib/currency';

export interface FlightCharge {
    /** The supplier amount before markup, in `baseCurrency`. */
    originalPrice: number;
    markupRate: number;
    markupAmount: number;
    capped: boolean;
    /** What the traveller pays, in `chargeCurrency` major units. */
    chargePrice: number;
    /** `chargePrice` in the currency's minor units, as Stripe wants it. */
    stripeAmount: number;
}

/**
 * The charge for a Duffel fare: markup on the supplier total, then conversion into the traveller's
 * charge currency.
 *
 * This is the arithmetic /book applies to an order's locked total, lifted out so that the amount a
 * card is authorised for and the amount captured after the order is bought cannot disagree.
 * Keep it in lockstep with /book until the order-first path is deleted.
 *
 * The flat component of the markup is USD-denominated (it recovers Duffel's order fee and
 * Stripe's fixed fee), so it is converted into the supplier currency first. When that conversion
 * has no rate it is dropped rather than failing: under-recovering one booking's flat fee is
 * cheaper than refusing the booking. The final conversion into the charge currency throws,
 * because charging a number in the wrong unit is worse than not charging.
 */
export function quoteFlightCharge({ baseTotal, baseCurrency, chargeCurrency }: {
    baseTotal: number;
    baseCurrency: string;
    chargeCurrency: string;
}): FlightCharge {
    const base = baseCurrency.toLowerCase();
    const charge = chargeCurrency.toLowerCase();

    let flatInBase = FLIGHT_MARKUP_SPEC.flat;
    try {
        flatInBase = convertCurrencyStrict(FLIGHT_MARKUP_SPEC.flat, 'usd', base);
    } catch {
        flatInBase = 0;
    }

    const pricing = applyMarkup(baseTotal, FLIGHT_MARKUP_SPEC, flatInBase);
    const chargePrice = charge !== base
        ? Math.round(convertCurrencyStrict(pricing.chargedPrice, base, charge.toUpperCase()) * 100) / 100
        : pricing.chargedPrice;

    return {
        originalPrice: pricing.originalPrice,
        markupRate: pricing.markupRate,
        markupAmount: pricing.markupAmount,
        capped: pricing.capped,
        chargePrice,
        stripeAmount: toStripeAmount(chargePrice, charge),
    };
}
```

- [ ] **Step 4: Run and see it pass**

Run: `npx vitest run src/lib/server/flights/flight-charge.test.ts`
Expected: PASS, 6 tests.

If the "converts the USD flat component" or "drops the flat" test fails on an arithmetic detail, compare against `/book` lines 1500–1546 and fix the helper, not the test: the helper must reproduce that code.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/flights/flight-charge.ts src/lib/server/flights/flight-charge.test.ts
git commit -m "feat(flights): one place for the markup and FX arithmetic of a fare" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Outcome types and `markFailed`

**Files:**
- Create: `src/lib/server/flights/authorised-outcome.ts`
- Modify: `src/lib/server/flights/create-booking.ts` (export `markFailed`)

- [ ] **Step 1: Write the shared types**

`src/lib/server/flights/authorised-outcome.ts`:

```ts
/** A fare that moved while we were ordering, in bare fares (never including seats or bags). */
export interface PriceChange {
    oldPrice: number;
    newPrice: number;
    currency: string;
}

/** Why a session ended without a booking, as the traveller should be told it. */
export interface SessionFailure {
    errorCode: string;
    priceChange?: PriceChange;
}

/** What finalising an authorised Duffel intent came to. */
export type FinaliseOutcome =
    /** A booking exists (this call made it, or another path did: `alreadyBooked`). */
    | { kind: 'booked'; bookingId?: string; pnr?: string; status?: string; alreadyBooked: boolean }
    /** Nothing was bought and the hold has been released. */
    | { kind: 'refused'; errorCode: string; priceChange?: PriceChange }
    /** Another path owns this session, or it is mid-flight; nothing was decided here. */
    | { kind: 'in_progress' }
    /** The intent is not one this flow handles, or the card is not authorised. */
    | { kind: 'not_authorised'; reason: string };
```

- [ ] **Step 2: Export `markFailed`**

In `src/lib/server/flights/create-booking.ts`, change:

```ts
async function markFailed(
```

to:

```ts
export async function markFailed(
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/lib/server/flights/authorised-outcome.ts src/lib/server/flights/create-booking.ts
git commit -m "feat(flights): outcome types for finalising an authorised intent" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: `finaliseDuffelAuthorised`

**Files:**
- Create: `src/lib/server/flights/finalise-authorised.ts`
- Test: `src/lib/server/flights/finalise-authorised.test.ts`
- Test: `src/lib/server/flights/finalise-authorised.integration.test.ts`

- [ ] **Step 1: Write the failing unit tests**

`src/lib/server/flights/finalise-authorised.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { finaliseDuffelAuthorised, type ClaimedSession, type FinaliseDeps, type SessionStore } from './finalise-authorised';

const OFFER = {
    id: 'off_1', total_amount: '100.00', total_currency: 'USD', passengers: [{ id: 'pas_1' }],
    slices: [{ origin: { iata_code: 'MNL' }, destination: { iata_code: 'ICN' }, segments: [] }],
};

const intent = (over: Record<string, unknown> = {}) => ({
    id: 'pi_1', status: 'requires_capture', currency: 'usd', amount: 11_000, amount_capturable: 11_000,
    metadata: { captureFlow: 'authorise_first', bookingSessionId: 'sess_1', provider: 'duffel' },
    ...over,
});

const session = (over: Partial<ClaimedSession> = {}): ClaimedSession => ({
    id: 'sess_1', userId: 'user_1', flight: { _rawOffer: OFFER },
    passengers: [{ firstName: 'Ana', lastName: 'Cruz', birthDate: '1990-01-01', gender: 'F', type: 'ADT' }],
    contact: { email: 'ana@example.com', phone: '10-1234-5678', countryCode: '82' },
    seatServiceIds: null, bagServiceIds: null, confirmedPrice: null, idempotencyKey: 'idem-1',
    duffelPreOrderId: null, previousClaimAt: null, ...over,
});

const ORDER = { id: 'ord_1', booking_reference: 'ABC123', documents: [], total_amount: '100.00', total_currency: 'USD' };

function harness(opts: {
    session?: ClaimedSession | null;
    pi?: Record<string, unknown>;
    deps?: Partial<FinaliseDeps>;
    store?: Partial<SessionStore>;
} = {}) {
    const log: string[] = [];
    const store: SessionStore = {
        claim: vi.fn(async () => { log.push('claim'); return opts.session === undefined ? session() : opts.session; }),
        bookingFor: vi.fn(async () => null),
        stakeOrder: vi.fn(async () => { log.push('stake'); }),
        recordOrder: vi.fn(async () => { log.push('record'); }),
        release: vi.fn(async () => { log.push('release'); }),
        fail: vi.fn(async () => { log.push('fail'); }),
        otherLiveOrder: vi.fn(async () => false),
        ...opts.store,
    };
    const deps: FinaliseDeps = {
        stripe: {
            paymentIntents: {
                retrieve: vi.fn(async () => opts.pi ?? intent()),
                capture: vi.fn(async () => { log.push('capture'); return {}; }),
                cancel: vi.fn(async () => ({})),
            },
        } as any,
        store,
        duffelToken: 'duffel_test_abc',
        priceTolerance: 0.5,
        placeOrder: vi.fn(async () => {
            log.push('place');
            return { kind: 'success', order: ORDER, finalTotal: '100.00', finalCurrency: 'USD', usedOffer: OFFER };
        }) as any,
        cancelOrder: vi.fn(async () => { log.push('cancel_order'); return true; }),
        findOrderSince: vi.fn(async () => null),
        servicePrices: vi.fn(async (offer: any) => offer),
        fetchOrder: vi.fn(async () => null),
        createBooking: vi.fn(async () => {
            log.push('book');
            return { success: true, bookingId: 'bk_1', pnr: 'ABC123', status: 'pnr_created' };
        }),
        markFailed: vi.fn(async () => { log.push('mark_failed'); }),
        notify: vi.fn(),
        quote: vi.fn(() => ({ stripeAmount: 10_500 })) as any,
        ...opts.deps,
    };
    return { log, store, deps };
}

const input = { sessionId: 'sess_1', paymentIntentId: 'pi_1' };

describe('finaliseDuffelAuthorised', () => {
    it('buys the order, ties it to the session, then captures, then records the booking', async () => {
        const h = harness();
        const outcome = await finaliseDuffelAuthorised(input, h.deps);

        expect(outcome).toEqual({ kind: 'booked', bookingId: 'bk_1', pnr: 'ABC123', status: 'pnr_created', alreadyBooked: false });
        expect(h.log).toEqual(['claim', 'place', 'stake', 'record', 'capture', 'book']);
        expect(h.deps.stripe.paymentIntents.capture).toHaveBeenCalledWith(
            'pi_1', { amount_to_capture: 10_500 }, { idempotencyKey: 'flight-capture-sess_1' },
        );
    });

    it('captures the lower amount when the order came to less than was authorised', async () => {
        const h = harness({ deps: { quote: vi.fn(() => ({ stripeAmount: 9_000 })) as any } });
        await finaliseDuffelAuthorised(input, h.deps);
        expect(h.deps.stripe.paymentIntents.capture).toHaveBeenCalledWith('pi_1', { amount_to_capture: 9_000 }, expect.anything());
    });

    it('never captures more than was authorised: a small rise is ours to absorb', async () => {
        const h = harness({ deps: { quote: vi.fn(() => ({ stripeAmount: 11_400 })) as any } });
        await finaliseDuffelAuthorised(input, h.deps);
        expect(h.deps.stripe.paymentIntents.capture).toHaveBeenCalledWith('pi_1', { amount_to_capture: 11_000 }, expect.anything());
    });

    it('releases the hold when the offer is gone, and never captures', async () => {
        const h = harness({ deps: {
            placeOrder: vi.fn(async () => ({ kind: 'error', status: 422, data: { errors: [{ code: 'offer_no_longer_available' }] } })) as any,
        } });
        const outcome = await finaliseDuffelAuthorised(input, h.deps);

        expect(outcome).toEqual({ kind: 'refused', errorCode: 'flight_unavailable' });
        expect(h.log).toEqual(['claim', 'fail', 'mark_failed']);
        expect(h.store.fail).toHaveBeenCalledWith('sess_1', { errorCode: 'flight_unavailable' });
    });

    it('releases the hold on a price rise and says what the new fare is', async () => {
        const priceChange = { oldPrice: 100, newPrice: 110, currency: 'USD' };
        const h = harness({ deps: { placeOrder: vi.fn(async () => ({ kind: 'price_changed', ...priceChange })) as any } });
        const outcome = await finaliseDuffelAuthorised(input, h.deps);

        expect(outcome).toEqual({ kind: 'refused', errorCode: 'price_changed', priceChange });
        expect(h.store.fail).toHaveBeenCalledWith('sess_1', { errorCode: 'price_changed', priceChange });
        expect(h.deps.stripe.paymentIntents.capture).not.toHaveBeenCalled();
    });

    it('treats a replaced offer as unavailable: the traveller has to choose again', async () => {
        const h = harness({ deps: { placeOrder: vi.fn(async () => ({ kind: 'offer_replaced', newOfferId: 'o2', newOffer: {} })) as any } });
        expect(await finaliseDuffelAuthorised(input, h.deps)).toEqual({ kind: 'refused', errorCode: 'flight_unavailable' });
    });

    it('gives the seat back, and says so, when the order was bought but the money would not move', async () => {
        const h = harness({ deps: {
            stripe: { paymentIntents: {
                retrieve: vi.fn(async () => intent()),
                capture: vi.fn(async () => { throw new Error('card_declined'); }),
                cancel: vi.fn(async () => ({})),
            } } as any,
        } });
        const outcome = await finaliseDuffelAuthorised(input, h.deps);

        expect(outcome).toEqual({ kind: 'refused', errorCode: 'booking_failed' });
        expect(h.deps.cancelOrder).toHaveBeenCalledWith('duffel_test_abc', 'ord_1', expect.any(String));
        expect(h.deps.notify).toHaveBeenCalled();
        expect(h.log).not.toContain('book');
    });

    it('does not refuse a booking that exists but could not be recorded after the money moved', async () => {
        const h = harness({ deps: { createBooking: vi.fn(async () => ({ success: false, error: 'db down' })) as any } });
        const outcome = await finaliseDuffelAuthorised(input, h.deps);

        expect(outcome).toEqual({ kind: 'in_progress' });
        expect(h.deps.notify).toHaveBeenCalled();
        expect(h.store.fail).not.toHaveBeenCalled();
    });

    it('refuses a duplicate: this traveller already holds an order for these passengers', async () => {
        const h = harness({ store: { otherLiveOrder: vi.fn(async () => true) } });
        const outcome = await finaliseDuffelAuthorised(input, h.deps);

        expect(outcome).toEqual({ kind: 'refused', errorCode: 'duplicate_booking' });
        expect(h.deps.placeOrder).not.toHaveBeenCalled();
    });

    it('refuses before ordering when the phone number can never be accepted', async () => {
        const h = harness({ session: session({ contact: { email: 'a@b.co', phone: '12' } }) });
        expect(await finaliseDuffelAuthorised(input, h.deps)).toEqual({ kind: 'refused', errorCode: 'phone_number_invalid' });
        expect(h.deps.placeOrder).not.toHaveBeenCalled();
    });

    it('places nothing when another path already booked the session', async () => {
        const h = harness({ session: null, store: { bookingFor: vi.fn(async () => ({ id: 'bk_9', pnr: 'ZZZ999', status: 'ticketed' })) } });
        const outcome = await finaliseDuffelAuthorised(input, h.deps);

        expect(outcome).toEqual({ kind: 'booked', bookingId: 'bk_9', pnr: 'ZZZ999', status: 'ticketed', alreadyBooked: true });
        expect(h.deps.placeOrder).not.toHaveBeenCalled();
    });

    it('reports in_progress when the claim is held elsewhere and nothing is booked yet', async () => {
        const h = harness({ session: null });
        expect(await finaliseDuffelAuthorised(input, h.deps)).toEqual({ kind: 'in_progress' });
    });

    it('leaves a card that is not authorised alone', async () => {
        const h = harness({ pi: intent({ status: 'requires_payment_method' }) });
        expect(await finaliseDuffelAuthorised(input, h.deps)).toEqual({ kind: 'not_authorised', reason: 'requires_payment_method' });
        expect(h.store.claim).not.toHaveBeenCalled();
    });

    it('leaves an intent that was not created for this flow alone', async () => {
        const h = harness({ pi: intent({ metadata: { provider: 'duffel', bookingSessionId: 'sess_1' } }) });
        expect(await finaliseDuffelAuthorised(input, h.deps)).toEqual({ kind: 'not_authorised', reason: 'wrong_flow' });
    });

    it('records the booking, without claiming or ordering, when the money was already captured', async () => {
        const h = harness({ pi: intent({ status: 'succeeded' }) });
        const outcome = await finaliseDuffelAuthorised(input, h.deps);

        expect(outcome).toMatchObject({ kind: 'booked', bookingId: 'bk_1' });
        expect(h.store.claim).not.toHaveBeenCalled();
        expect(h.deps.placeOrder).not.toHaveBeenCalled();
    });

    it('resumes an order the session already holds instead of buying another', async () => {
        const h = harness({
            session: session({ duffelPreOrderId: 'ord_9' }),
            deps: { fetchOrder: vi.fn(async () => ({ ...ORDER, id: 'ord_9' })) },
        });
        const outcome = await finaliseDuffelAuthorised(input, h.deps);

        expect(outcome).toMatchObject({ kind: 'booked' });
        expect(h.deps.placeOrder).not.toHaveBeenCalled();
        expect(h.store.stakeOrder).toHaveBeenCalledWith('sess_1', 'ord_9');
        expect(h.deps.stripe.paymentIntents.capture).toHaveBeenCalled();
    });

    it('adopts an order the previous claimer placed but never recorded', async () => {
        const h = harness({
            session: session({ previousClaimAt: '2026-10-12T10:00:00.000Z' }),
            deps: { findOrderSince: vi.fn(async () => ({ ...ORDER, id: 'ord_late' })) },
        });
        await finaliseDuffelAuthorised(input, h.deps);

        expect(h.deps.placeOrder).not.toHaveBeenCalled();
        expect(h.store.stakeOrder).toHaveBeenCalledWith('sess_1', 'ord_late');
    });

    it('hands the claim back, and rethrows, when something unexpected goes wrong', async () => {
        const h = harness({ deps: { placeOrder: vi.fn(async () => { throw new Error('socket hang up'); }) as any } });
        await expect(finaliseDuffelAuthorised(input, h.deps)).rejects.toThrow('socket hang up');
        expect(h.store.release).toHaveBeenCalledWith('sess_1');
    });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run src/lib/server/flights/finalise-authorised.test.ts`
Expected: FAIL, module unresolved.

- [ ] **Step 3: Implement `finalise-authorised.ts`**

```ts
import type Stripe from 'stripe';
import { getSqlAdmin } from '@/lib/db/postgres';
import { stripe as defaultStripe } from '@/lib/stripe/server';
import { env } from '@/utils/env';
import { createAdminClient } from '@/utils/postgres/admin';
import { fromStripeAmount, getFlightPriceTolerance } from '@/lib/pricing';
import { createNotification } from '@/lib/server/admin/notify';
import { captureFlowOf } from './capture-flow';
import { computeOrderTotal } from './duffel-order-total';
import { buildDuffelOrderPassengers, toE164Phone } from './duffel-order-passengers';
import { mapDuffelOrderFailure } from './duffel-order-errors';
import { placeDuffelOrder } from './place-duffel-order';
import { quoteFlightCharge } from './flight-charge';
import { cancelDuffelOrder } from './duffel-cancel';
import { findOrderFromTimedOutAttempt } from './duffel-order-reconcile';
import { withDuffelServicePrices } from './duffel-service-prices';
import { withBookedItinerary } from './duffel-order-segments';
import { createBooking, markFailed } from './create-booking';
import { REUSE_WINDOW_MS } from './preorder-reuse';
import type { FinaliseOutcome, PriceChange, SessionFailure } from './authorised-outcome';

/**
 * Finalise a Duffel PaymentIntent whose card has been authorised (ADR-0050).
 *
 * The order is bought only now, so a declined card never costs us a ticket. This runs from the
 * Stripe webhook, from /confirm as its fallback, and from auto-recover; the claim below is what
 * makes any two of them place one order. Every refusal releases the hold and records why, so the
 * traveller is told the card was not charged.
 */

/**
 * A claim older than this may be taken over. An order attempt can legitimately run 130s plus one
 * 130s retry after a price change, so anything younger may still be a live attempt.
 */
const STALE_CLAIM_MS = 8 * 60 * 1000;

export interface ClaimedSession {
    id: string;
    userId: string;
    flight: any;
    passengers: any[];
    contact: any;
    seatServiceIds: string[] | null;
    bagServiceIds: string[] | null;
    confirmedPrice: number | null;
    idempotencyKey: string | null;
    duffelPreOrderId: string | null;
    /** When a previous claim began, if this claim took one over. */
    previousClaimAt: string | null;
}

export interface SessionStore {
    /** Atomically take the session to `ordering`, or null when it is held elsewhere or done. */
    claim(sessionId: string, staleAfterMs: number): Promise<ClaimedSession | null>;
    bookingFor(sessionId: string): Promise<{ id: string; pnr: string | null; status: string } | null>;
    /** The smallest possible write: tie an order to the session before anything else can fail. */
    stakeOrder(sessionId: string, orderId: string): Promise<void>;
    /** Write the order onto the session and hand it back to `payment_authorized`. */
    recordOrder(sessionId: string, fields: {
        orderId: string; pnr: string; tickets: string[]; ticketed: boolean;
        flight: any; originalPrice: number; chargedPrice: number;
    }): Promise<void>;
    /** Give a claim back without deciding anything. */
    release(sessionId: string): Promise<void>;
    fail(sessionId: string, failure: SessionFailure): Promise<void>;
    /** Does this traveller already hold an order for this offer and these passengers? */
    otherLiveOrder(args: {
        userId: string; offerId: string; excludeSessionId: string; passengers: any[]; windowMs: number;
    }): Promise<boolean>;
}

export interface FinaliseDeps {
    stripe: { paymentIntents: Pick<Stripe.PaymentIntentsResource, 'retrieve' | 'capture' | 'cancel'> };
    store: SessionStore;
    duffelToken: string | undefined;
    priceTolerance: number;
    placeOrder: typeof placeDuffelOrder;
    cancelOrder: typeof cancelDuffelOrder;
    findOrderSince: typeof findOrderFromTimedOutAttempt;
    servicePrices: typeof withDuffelServicePrices;
    fetchOrder: (token: string, orderId: string) => Promise<any | null>;
    createBooking: typeof createBooking;
    markFailed: (sessionId: string, paymentIntentId: string, reason: string) => Promise<void>;
    notify: (title: string, body: string) => void;
    quote: typeof quoteFlightCharge;
}

export async function finaliseDuffelAuthorised(
    input: { sessionId: string; paymentIntentId: string },
    overrides: Partial<FinaliseDeps> = {},
): Promise<FinaliseOutcome> {
    const d: FinaliseDeps = { ...defaultDeps(), ...overrides };
    const { sessionId, paymentIntentId } = input;

    const pi = await d.stripe.paymentIntents.retrieve(paymentIntentId);
    if (captureFlowOf(pi.metadata as Record<string, string>) !== 'authorise_first' || pi.metadata?.bookingSessionId !== sessionId) {
        return { kind: 'not_authorised', reason: 'wrong_flow' };
    }

    // Captured already: the booking only has to be recorded, which createBooking does once.
    if (pi.status === 'succeeded') {
        return fromBooking(await d.createBooking({ sessionId, paymentIntentId }));
    }
    if (pi.status !== 'requires_capture') {
        return { kind: 'not_authorised', reason: pi.status };
    }

    const session = await d.store.claim(sessionId, STALE_CLAIM_MS);
    if (!session) {
        const booking = await d.store.bookingFor(sessionId);
        if (booking && booking.status !== 'failed') {
            return { kind: 'booked', bookingId: booking.id, pnr: booking.pnr ?? undefined, status: booking.status, alreadyBooked: true };
        }
        return { kind: 'in_progress' };
    }

    try {
        return await orderAndCapture(session, pi, d);
    } catch (err) {
        // Unexpected: hand the claim back so the sweep can try again. Anything already bought is
        // tied to the session (staked) before the first step that could throw.
        await d.store.release(sessionId).catch(() => { /* best effort */ });
        throw err;
    }
}

async function orderAndCapture(session: ClaimedSession, pi: Stripe.PaymentIntent, d: FinaliseDeps): Promise<FinaliseOutcome> {
    const refuse = async (errorCode: string, priceChange?: PriceChange): Promise<FinaliseOutcome> => {
        await d.store.fail(session.id, { errorCode, ...(priceChange ? { priceChange } : {}) });
        // Cancels the intent (releases the hold) and records the failed booking row the polling reads.
        await d.markFailed(session.id, pi.id, errorCode);
        return { kind: 'refused', errorCode, ...(priceChange ? { priceChange } : {}) };
    };

    const token = d.duffelToken;
    const rawOffer0 = session.flight?._rawOffer;
    if (!token || !rawOffer0?.id) return refuse('flight_unavailable');

    const seats = session.seatServiceIds ?? undefined;
    const bags = session.bagServiceIds ?? undefined;

    // The posted offer is a search result and carries no service prices; ask Duffel for them.
    const rawOffer = await d.servicePrices(rawOffer0, seats, bags, token);
    const computed = computeOrderTotal(rawOffer, seats, bags);
    const currency: string = rawOffer.total_currency ?? 'USD';

    const phone = toE164Phone(session.contact ?? {});
    if (!phone.ok) return refuse('phone_number_invalid');

    let order: any = null;
    let orderTotal = computed.total;
    let orderCurrency = currency;

    // 1. An order this session already holds: an earlier claimer got that far.
    if (session.duffelPreOrderId) {
        order = await d.fetchOrder(token, session.duffelPreOrderId);
    }

    // 2. Nothing held, but a claimer that died may have bought one we never heard about.
    if (!order && session.previousClaimAt) {
        const slices: any[] = rawOffer.slices ?? [];
        order = await d.findOrderSince(token, {
            sinceIso: session.previousClaimAt,
            origin: slices[0]?.origin?.iata_code ?? '',
            destination: slices[slices.length - 1]?.destination?.iata_code ?? '',
            totalAmount: computed.total,
            currency,
            familyName: session.passengers?.[0]?.lastName || undefined,
        });
    }

    if (order) {
        orderTotal = String(order.total_amount ?? computed.total);
        orderCurrency = String(order.total_currency ?? currency);
    } else {
        // 3. Buy it, unless this traveller already holds this journey from another session.
        const duplicate = await d.store.otherLiveOrder({
            userId: session.userId, offerId: rawOffer0.id, excludeSessionId: session.id,
            passengers: session.passengers ?? [], windowMs: REUSE_WINDOW_MS,
        });
        if (duplicate) return refuse('duplicate_booking');

        const placed = await d.placeOrder({
            duffelToken: token,
            rawOffer,
            passengers: buildDuffelOrderPassengers({
                passengers: session.passengers ?? [], contact: session.contact ?? {}, rawOffer, e164: phone.e164,
            }),
            total: computed.total,
            currency,
            seatServiceIds: seats,
            bagServiceIds: bags,
            confirmedPrice: session.confirmedPrice ?? undefined,
            priceTolerance: d.priceTolerance,
            idempotencyKey: session.idempotencyKey ?? crypto.randomUUID(),
        });

        if (placed.kind === 'price_changed') {
            return refuse('price_changed', { oldPrice: placed.oldPrice, newPrice: placed.newPrice, currency: placed.currency });
        }
        // Seats and bags cannot carry to a re-quoted offer; the traveller has to choose again.
        if (placed.kind === 'offer_replaced') return refuse('flight_unavailable');
        if (placed.kind === 'error') {
            return refuse(mapDuffelOrderFailure(placed.status, placed.data).errorCode ?? 'booking_failed');
        }

        order = placed.order;
        orderTotal = placed.finalTotal;
        orderCurrency = placed.finalCurrency;
    }

    // The order exists and is ours. Tie it to the session before anything else can fail, so the
    // orphan sweep can always find it.
    await d.store.stakeOrder(session.id, order.id);

    const charge = d.quote({ baseTotal: parseFloat(orderTotal), baseCurrency: orderCurrency, chargeCurrency: pi.currency });
    const authorised = pi.amount_capturable || pi.amount;
    // We can take less than was authorised, never more. A rise within tolerance is absorbed.
    const captureAmount = Math.min(authorised, charge.stripeAmount);

    const tickets: string[] = (order.documents ?? [])
        .filter((doc: any) => doc.type === 'electronic_ticket')
        .map((doc: any) => doc.unique_identifier as string);

    await d.store.recordOrder(session.id, {
        orderId: order.id,
        pnr: order.booking_reference ?? order.id,
        tickets,
        ticketed: tickets.length > 0,
        flight: withBookedItinerary(session.flight, order),
        originalPrice: parseFloat(orderTotal),
        chargedPrice: fromStripeAmount(captureAmount, pi.currency),
    });

    try {
        await d.stripe.paymentIntents.capture(
            pi.id,
            { amount_to_capture: captureAmount },
            { idempotencyKey: `flight-capture-${session.id}` },
        );
    } catch (err: any) {
        // Authorised, ticketed, and the money would not move. Giving the seat back is the only
        // way to leave nothing owed. Cancelling an instant order may not recover the fare (fare
        // rules decide), so this tells the team instead of assuming.
        const released = await d.cancelOrder(token, order.id, 'capture failed after the order was placed');
        d.notify(
            'Flight capture failed after ordering',
            `Session ${session.id} (PI ${pi.id}): the card was authorised and Duffel order ${order.id} was placed, ` +
            `but capture failed (${err?.message ?? 'unknown'}). Order cancellation ${released ? 'succeeded' : 'FAILED — cancel it by hand'}.`,
        );
        return refuse('booking_failed');
    }

    const booked = await d.createBooking({ sessionId: session.id, paymentIntentId: pi.id });
    if (!booked.success && !booked.alreadyBooked) {
        // Money moved and an order exists. Refusing here would refund a live ticket. Leave it
        // for auto-recover, which records it, and tell the team.
        d.notify(
            'Flight booked but not recorded',
            `Session ${session.id} (PI ${pi.id}) is captured and ordered (${order.id}) but the booking row ` +
            `could not be written (${booked.error ?? 'unknown'}). Auto-recover will retry; do not refund.`,
        );
        return { kind: 'in_progress' };
    }
    return fromBooking(booked);
}

function fromBooking(result: Awaited<ReturnType<typeof createBooking>>): FinaliseOutcome {
    if (result.success) {
        return {
            kind: 'booked', bookingId: result.bookingId, pnr: result.pnr, status: result.status,
            alreadyBooked: result.alreadyBooked === true,
        };
    }
    return result.alreadyBooked ? { kind: 'in_progress' } : { kind: 'refused', errorCode: 'booking_failed' };
}

// ── Defaults ──────────────────────────────────────────────────────────────────

async function fetchDuffelOrder(token: string, orderId: string): Promise<any | null> {
    try {
        const res = await fetch(`https://api.duffel.com/air/orders/${encodeURIComponent(orderId)}`, {
            headers: { Authorization: `Bearer ${token}`, 'Duffel-Version': 'v2' },
            signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) return null;
        const order = (await res.json())?.data;
        return order?.id && !order.cancelled_at ? order : null;
    } catch {
        return null;
    }
}

/** Submitted passengers, compared by name and date of birth, order-insensitive. */
function samePassengers(a: any[], b: any[]): boolean {
    const key = (p: any) => `${String(p?.firstName ?? '').trim().toLowerCase()}|${String(p?.lastName ?? '').trim().toLowerCase()}|${String(p?.birthDate ?? '').trim()}`;
    const left = (a ?? []).map(key).sort();
    const right = (b ?? []).map(key).sort();
    return left.length === right.length && left.every((k, i) => k === right[i]);
}

export function sqlSessionStore(sql: ReturnType<typeof getSqlAdmin>): SessionStore {
    return {
        async claim(sessionId, staleAfterMs) {
            const rows = await sql<any[]>`
                WITH prev AS (
                    SELECT id, status, updated_at FROM booking_sessions WHERE id = ${sessionId} FOR UPDATE
                )
                UPDATE booking_sessions s
                   SET status = 'ordering', updated_at = now()
                  FROM prev
                 WHERE s.id = prev.id
                   AND (prev.status IN ('initiated', 'payment_initiated', 'payment_authorized')
                        OR (prev.status = 'ordering'
                            AND prev.updated_at < now() - make_interval(secs => ${staleAfterMs / 1000})))
                RETURNING s.id, s.user_id AS "userId", s.flight, s.passengers, s.contact,
                          s.seat_service_ids AS "seatServiceIds", s.bag_service_ids AS "bagServiceIds",
                          s.confirmed_price AS "confirmedPrice", s.idempotency_key AS "idempotencyKey",
                          s.duffel_pre_order_id AS "duffelPreOrderId",
                          CASE WHEN prev.status = 'ordering' THEN prev.updated_at END AS "previousClaimAt"`;
            const row = rows[0];
            if (!row) return null;
            return {
                ...row,
                confirmedPrice: row.confirmedPrice == null ? null : Number(row.confirmedPrice),
                previousClaimAt: row.previousClaimAt ? new Date(row.previousClaimAt).toISOString() : null,
            };
        },

        async bookingFor(sessionId) {
            const rows = await sql<{ id: string; pnr: string | null; status: string }[]>`
                SELECT id, pnr, status FROM flight_bookings WHERE session_id = ${sessionId} LIMIT 1`;
            return rows[0] ?? null;
        },

        async stakeOrder(sessionId, orderId) {
            await sql`UPDATE booking_sessions SET duffel_pre_order_id = ${orderId} WHERE id = ${sessionId}`;
        },

        async recordOrder(sessionId, f) {
            await sql`
                UPDATE booking_sessions
                   SET duffel_pre_order_id = ${f.orderId},
                       duffel_pre_order_pnr = ${f.pnr},
                       duffel_pre_order_tickets = ${f.tickets}::text[],
                       duffel_pre_order_ticketed = ${f.ticketed},
                       flight = ${JSON.stringify(f.flight)}::jsonb,
                       original_price = ${f.originalPrice},
                       charged_price = ${f.chargedPrice},
                       status = 'payment_authorized',
                       updated_at = now()
                 WHERE id = ${sessionId}`;
        },

        async release(sessionId) {
            await sql`
                UPDATE booking_sessions SET status = 'payment_authorized', updated_at = now()
                 WHERE id = ${sessionId} AND status = 'ordering'`;
        },

        async fail(sessionId, failure) {
            await sql`UPDATE booking_sessions SET failure = ${JSON.stringify(failure)}::jsonb WHERE id = ${sessionId}`;
        },

        async otherLiveOrder({ userId, offerId, excludeSessionId, passengers, windowMs }) {
            const since = new Date(Date.now() - windowMs).toISOString();
            const rows = await sql<{ passengers: any[] }[]>`
                SELECT passengers FROM booking_sessions
                 WHERE user_id = ${userId} AND id <> ${excludeSessionId}
                   AND duffel_pre_order_id IS NOT NULL
                   AND status NOT IN ('failed', 'expired')
                   AND created_at >= ${since}
                   AND flight #>> '{_rawOffer,id}' = ${offerId}`;
            return rows.some(r => samePassengers(r.passengers, passengers));
        },
    };
}

function defaultDeps(): FinaliseDeps {
    const sql = getSqlAdmin();
    const db = createAdminClient();
    return {
        stripe: defaultStripe as any,
        store: sqlSessionStore(sql),
        duffelToken: env.DUFFEL_TOKEN,
        priceTolerance: getFlightPriceTolerance(),
        placeOrder: placeDuffelOrder,
        cancelOrder: cancelDuffelOrder,
        findOrderSince: findOrderFromTimedOutAttempt,
        servicePrices: withDuffelServicePrices,
        fetchOrder: fetchDuffelOrder,
        createBooking,
        markFailed: (sessionId, paymentIntentId, reason) => markFailed(sql, db, sessionId, paymentIntentId, reason),
        notify: (title, body) => { void createNotification(title, body, 'booking'); },
        quote: quoteFlightCharge,
    };
}
```

- [ ] **Step 4: Run the unit tests and see them pass**

Run: `npx vitest run src/lib/server/flights/finalise-authorised.test.ts`
Expected: PASS, 18 tests.

- [ ] **Step 5: Write the claim integration test**

`src/lib/server/flights/finalise-authorised.integration.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';

/**
 * The claim is what stops two paths buying two tickets for one booking, so it is tested against
 * a real database: the guarantee lives in what Postgres does with the UPDATE, not in our code.
 * Skips when no database is reachable, like its sibling *.integration.test.ts files.
 */

async function databaseReachable(): Promise<boolean> {
    if (!process.env.DATABASE_URL) return false;
    try {
        const { getSqlAdmin } = await import('@/lib/db/postgres');
        await getSqlAdmin()`SELECT 1`;
        return true;
    } catch {
        return false;
    }
}

const created: string[] = [];

async function db() {
    const { getSqlAdmin } = await import('@/lib/db/postgres');
    return getSqlAdmin();
}

async function makeSession(status: string, updatedAtAgoMinutes = 0): Promise<{ id: string; userId: string }> {
    const sql = await db();
    const [user] = await sql`SELECT id FROM users LIMIT 1`;
    const [row] = await sql`
        INSERT INTO booking_sessions (user_id, provider, status, expires_at, flight, updated_at)
        VALUES (${user.id}, 'duffel', ${status}, now() + interval '30 minutes',
                ${JSON.stringify({ _rawOffer: { id: 'off_int_1' } })}::jsonb,
                now() - make_interval(mins => ${updatedAtAgoMinutes}))
        RETURNING id`;
    created.push(row.id);
    return { id: row.id, userId: user.id };
}

afterEach(async () => {
    if (created.length) {
        const sql = await db();
        await sql`DELETE FROM booking_sessions WHERE id = ANY(${created})`;
        created.length = 0;
    }
});

describe('sqlSessionStore.claim', async () => {
    const reachable = await databaseReachable();
    const maybe = reachable ? it : it.skip;

    maybe('is taken once: the second claimer gets nothing', async () => {
        const { sqlSessionStore } = await import('./finalise-authorised');
        const store = sqlSessionStore(await db());
        const { id } = await makeSession('payment_initiated');

        const first = await store.claim(id, 8 * 60_000);
        const second = await store.claim(id, 8 * 60_000);

        expect(first?.id).toBe(id);
        expect(first?.previousClaimAt).toBeNull();
        expect(second).toBeNull();
    });

    maybe('is not taken over while the previous claim is recent', async () => {
        const { sqlSessionStore } = await import('./finalise-authorised');
        const store = sqlSessionStore(await db());
        const { id } = await makeSession('ordering', 2);

        expect(await store.claim(id, 8 * 60_000)).toBeNull();
    });

    maybe('is taken over once the previous claim is stale, and says when it began', async () => {
        const { sqlSessionStore } = await import('./finalise-authorised');
        const store = sqlSessionStore(await db());
        const { id } = await makeSession('ordering', 20);

        const taken = await store.claim(id, 8 * 60_000);

        expect(taken?.id).toBe(id);
        expect(taken?.previousClaimAt).not.toBeNull();
    });

    maybe('does not claim a session that is already booked or failed', async () => {
        const { sqlSessionStore } = await import('./finalise-authorised');
        const store = sqlSessionStore(await db());
        const booked = await makeSession('booked');
        const failed = await makeSession('failed');

        expect(await store.claim(booked.id, 8 * 60_000)).toBeNull();
        expect(await store.claim(failed.id, 8 * 60_000)).toBeNull();
    });

    maybe('hands back to payment_authorized when released', async () => {
        const { sqlSessionStore } = await import('./finalise-authorised');
        const sql = await db();
        const store = sqlSessionStore(sql);
        const { id } = await makeSession('payment_initiated');

        await store.claim(id, 8 * 60_000);
        await store.release(id);

        const [row] = await sql`SELECT status FROM booking_sessions WHERE id = ${id}`;
        expect(row.status).toBe('payment_authorized');
    });
});
```

- [ ] **Step 6: Run the integration test**

Run (PowerShell, so `DATABASE_URL` comes from `.env` without printing it):

```powershell
$line = Get-Content .env | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -First 1
$env:DATABASE_URL = ($line -replace '^\s*DATABASE_URL\s*=\s*','').Trim().Trim('"',"'")
npx vitest run src/lib/server/flights/finalise-authorised.integration.test.ts
```

Expected: PASS, 5 tests (they skip, rather than fail, when no database is reachable). The migration from Task 1 must be applied.

- [ ] **Step 7: Type-check and commit**

Run: `npx tsc --noEmit`
Expected: no output.

```bash
git add src/lib/server/flights/finalise-authorised.ts src/lib/server/flights/finalise-authorised.test.ts src/lib/server/flights/finalise-authorised.integration.test.ts
git commit -m "feat(flights): finalise an authorised Duffel intent: claim, order, capture or release" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: How a refusal reaches the traveller

**Files:**
- Create: `src/lib/server/flights/failure-response.ts`
- Test: `src/lib/server/flights/failure-response.test.ts`
- Modify: `src/app/api/flights/booking-status/route.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { failedBookingBody, finaliseOutcomeResponse } from './failure-response';

describe('failedBookingBody', () => {
    it('keeps the legacy answer for a session with no recorded failure', () => {
        expect(failedBookingBody(null)).toMatchObject({ errorCode: 'booking_failed_refunded' });
        expect(failedBookingBody(undefined)).toMatchObject({ errorCode: 'booking_failed_refunded' });
        expect(failedBookingBody({} as any)).toMatchObject({ errorCode: 'booking_failed_refunded' });
    });

    it('answers the stored code, which says the card was not charged', () => {
        expect(failedBookingBody({ errorCode: 'flight_unavailable' })).toEqual({ errorCode: 'flight_unavailable' });
    });

    it('carries the new price when the fare moved', () => {
        const priceChange = { oldPrice: 100, newPrice: 110, currency: 'USD' };
        expect(failedBookingBody({ errorCode: 'price_changed', priceChange })).toEqual({ errorCode: 'price_changed', priceChange });
    });
});

describe('finaliseOutcomeResponse', () => {
    it('lets a booked outcome through: the caller carries on to ticketing', () => {
        expect(finaliseOutcomeResponse({ kind: 'booked', alreadyBooked: false })).toBeNull();
    });

    it('answers a refusal with its code and the new price', () => {
        const priceChange = { oldPrice: 100, newPrice: 110, currency: 'USD' };
        expect(finaliseOutcomeResponse({ kind: 'refused', errorCode: 'price_changed', priceChange })).toEqual({
            status: 409, body: { success: false, errorCode: 'price_changed', priceChange },
        });
        expect(finaliseOutcomeResponse({ kind: 'refused', errorCode: 'flight_unavailable' })).toEqual({
            status: 409, body: { success: false, errorCode: 'flight_unavailable' },
        });
    });

    it('answers in_progress as pending, so the client keeps waiting and keeps its recovery keys', () => {
        expect(finaliseOutcomeResponse({ kind: 'in_progress' })).toMatchObject({
            status: 202, body: { success: false, errorCode: 'booking_pending' },
        });
    });

    it('answers a card that is not authorised as a payment problem', () => {
        expect(finaliseOutcomeResponse({ kind: 'not_authorised', reason: 'requires_payment_method' })).toMatchObject({
            status: 402, body: { success: false },
        });
    });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run src/lib/server/flights/failure-response.test.ts`
Expected: FAIL, module unresolved.

- [ ] **Step 3: Implement**

```ts
import type { FinaliseOutcome, PriceChange, SessionFailure } from './authorised-outcome';

/**
 * The body a "this booking failed" answer carries.
 *
 * A session with a recorded failure is told what happened, in codes whose copy already says the
 * card was not charged. A session without one failed the legacy way (the order was bought, the
 * card then refused or the booking could not be completed, and the payment was refunded), so it
 * keeps the legacy answer.
 */
export function failedBookingBody(failure: SessionFailure | null | undefined): {
    errorCode: string;
    error?: string;
    priceChange?: PriceChange;
} {
    if (!failure?.errorCode) {
        return {
            errorCode: 'booking_failed_refunded',
            error: 'Booking failed — the flight offer was no longer available. Your payment has been automatically refunded.',
        };
    }
    return { errorCode: failure.errorCode, ...(failure.priceChange ? { priceChange: failure.priceChange } : {}) };
}

/**
 * What /confirm answers for a finalise outcome, or null when the booking exists and the caller
 * should carry on (ticketing, email).
 */
export function finaliseOutcomeResponse(outcome: FinaliseOutcome): { status: number; body: Record<string, unknown> } | null {
    switch (outcome.kind) {
        case 'booked':
            return null;
        case 'refused':
            return {
                status: 409,
                body: { success: false, errorCode: outcome.errorCode, ...(outcome.priceChange ? { priceChange: outcome.priceChange } : {}) },
            };
        case 'in_progress':
            return {
                status: 202,
                body: {
                    success: false,
                    errorCode: 'booking_pending',
                    error: 'Your payment is authorised and the booking is still completing. Check your trips page in a few minutes — do not pay again.',
                },
            };
        case 'not_authorised':
            return {
                status: 402,
                body: { success: false, error: `Payment not authorised (${outcome.reason}).` },
            };
    }
}
```

- [ ] **Step 4: Run and see it pass**

Run: `npx vitest run src/lib/server/flights/failure-response.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Use it in `booking-status`**

In `src/app/api/flights/booking-status/route.ts`, add the import:

```ts
import { failedBookingBody } from '@/lib/server/flights/failure-response';
```

and replace:

```ts
        if (booking.status === 'failed') {
            return NextResponse.json({
                found: true,
                failed: true,
                errorCode: 'booking_failed_refunded',
                error: 'Booking failed — the flight offer was no longer available. Your payment has been automatically refunded.',
            });
        }
```

with:

```ts
        if (booking.status === 'failed') {
            // A refusal after authorisation records why on the session; older failures have none.
            const { data: session } = await supabase
                .from('booking_sessions')
                .select('failure')
                .eq('id', sessionId)
                .maybeSingle();

            return NextResponse.json({
                found: true,
                failed: true,
                ...failedBookingBody((session as any)?.failure),
            });
        }
```

- [ ] **Step 6: Type-check and commit**

Run: `npx tsc --noEmit`
Expected: no output.

```bash
git add src/lib/server/flights/failure-response.ts src/lib/server/flights/failure-response.test.ts src/app/api/flights/booking-status/route.ts
git commit -m "feat(flights): tell the traveller why an authorised booking was refused" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Move the post-booking helpers out of the webhook file

Ticketing, email and ledger are inline in the webhook route, which Next.js will not let export them. Auto-recover needs them too, so they move, unchanged, into a module both import. This is a mechanical move; the legacy webhook behaviour does not change.

**Files:**
- Create: `src/lib/server/flights/post-booking.ts`
- Modify: `src/app/api/webhooks/stripe/route.ts`

- [ ] **Step 1: Read what is being moved**

Run: `Get-Content src/app/api/webhooks/stripe/route.ts | Select-Object -Skip 446`
Expected: lines 447 to the end of the file (578): the `// ─── Email Helper` banner, `fireBookingConfirmationEmail` (453–521), the `// ─── Financial Ledger Helper` banner, and `logFlightPaymentEvent` (544–578). The only outside names they use are `sendFlightBookingConfirmationEmail`, `mapFlightSegmentsForEmail` and `fetchStripeFee`.

- [ ] **Step 2: Create the module**

Create `src/lib/server/flights/post-booking.ts` containing, in this order:

1. These imports:

```ts
import { sendFlightBookingConfirmationEmail, mapFlightSegmentsForEmail } from '@/lib/server/email';
import { fetchStripeFee } from '@/lib/stripe/fee';
import { fromStripeAmount } from '@/lib/pricing';
import { createNotification } from '@/lib/server/admin/notify';
import { issueTicket } from './issue-ticket';
```

2. Lines 447–578 of the webhook file, **byte-for-byte** (banners, comments and both functions), with `export` added in front of `async function fireBookingConfirmationEmail(` and `async function logFlightPaymentEvent(`.
3. This function after them:

```ts
/**
 * Everything that follows a Duffel booking being recorded: auto-ticketing, the team notification,
 * the confirmation email and the payment ledger entry. Shared by the webhook and auto-recover so
 * a booking finalised by either is completed the same way.
 */
export async function completeDuffelBooking({ supabase, sessionId, paymentIntent, booking }: {
    supabase: any;
    sessionId: string;
    paymentIntent: { id: string; amount: number; currency: string | null };
    booking: { bookingId?: string; pnr?: string; status?: string; alreadyBooked?: boolean };
}): Promise<void> {
    if (booking.alreadyBooked) return;

    if (booking.status !== 'ticketed' && booking.bookingId) {
        const ticket = await issueTicket(booking.bookingId);
        console.log(ticket.success ? '[post-booking] Duffel ticketing OK' : `[post-booking] Duffel ticketing failed: ${ticket.error}`);
    }

    createNotification('Flight Booking Confirmed', `Duffel booking ${booking.pnr || sessionId} confirmed.`, 'booking');

    fireBookingConfirmationEmail(supabase, sessionId, booking, 'duffel')
        .catch(e => console.error('[post-booking] Duffel email error:', e));

    if (booking.bookingId) {
        logFlightPaymentEvent(supabase, {
            bookingId: booking.bookingId,
            amount: fromStripeAmount(paymentIntent.amount, paymentIntent.currency || 'usd'),
            currency: (paymentIntent.currency || 'usd').toUpperCase(),
            provider: 'duffel',
            transactionId: paymentIntent.id,
            metadata: { sessionId, pnr: booking.pnr },
        });
    }
}
```

Put the two new `import` lines at the top with the others.

- [ ] **Step 3: Use it from the webhook**

In `src/app/api/webhooks/stripe/route.ts`: delete lines 447–578 (nothing else), and add:

```ts
import { fireBookingConfirmationEmail, logFlightPaymentEvent } from '@/lib/server/flights/post-booking';
```

Then remove from the webhook's own imports only those that `npx eslint src/app/api/webhooks/stripe/route.ts` now reports unused; expect `sendFlightBookingConfirmationEmail`, `mapFlightSegmentsForEmail` and `fetchStripeFee`, unless the webhook uses them elsewhere.

- [ ] **Step 4: Verify nothing changed behaviourally**

Run: `npx tsc --noEmit; npx eslint src/app/api/webhooks/stripe/route.ts src/lib/server/flights/post-booking.ts`
Expected: no errors. Then run `git diff --stat`: the webhook file shows only deletions plus one import line; `post-booking.ts` is new.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/flights/post-booking.ts src/app/api/webhooks/stripe/route.ts
git commit -m "refactor(flights): move ticketing, email and ledger helpers out of the webhook route" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Webhook

**Files:**
- Modify: `src/app/api/webhooks/stripe/route.ts`

- [ ] **Step 1: Add the imports**

```ts
import { captureFlowOf } from '@/lib/server/flights/capture-flow';
import { finaliseDuffelAuthorised } from '@/lib/server/flights/finalise-authorised';
import { completeDuffelBooking } from '@/lib/server/flights/post-booking';
```

- [ ] **Step 2: Route authorise-first intents on `amount_capturable_updated`**

Inside the `payment_intent.amount_capturable_updated` branch, after the `if (!bookingSessionId) { ... }` block and before `if (provider !== 'mystifly_v2') {`, insert:

```ts
        // Duffel, authorise-first (ADR-0050): the card is held and no order exists yet. Buy it
        // now, then capture; a refusal releases the hold and tells the traveller why.
        if (provider === 'duffel' && captureFlowOf(pi.metadata) === 'authorise_first') {
            try {
                const outcome = await finaliseDuffelAuthorised({ sessionId: bookingSessionId, paymentIntentId: pi.id });
                console.log(`[Webhook] Duffel authorise-first ${bookingSessionId}: ${outcome.kind}`);

                if (outcome.kind === 'booked' && !outcome.alreadyBooked) {
                    await completeDuffelBooking({
                        supabase, sessionId: bookingSessionId,
                        paymentIntent: { id: pi.id, amount: pi.amount, currency: pi.currency },
                        booking: outcome,
                    });
                }
            } catch (err) {
                // Never 5xx: Stripe would retry, and the claim has been handed back for auto-recover.
                console.error('[Webhook] Duffel authorise-first error:', err);
            }
            await commitEvent();
            return NextResponse.json({ received: true });
        }
```

- [ ] **Step 3: Keep the legacy `succeeded` handler away from these intents**

In the `payment_intent.succeeded` branch, after the block that skips `provider === 'mystifly_v2'`, insert:

```ts
        // Authorise-first intents are finalised (ordered, captured, ticketed, emailed) from
        // amount_capturable_updated. The auto-refund below assumes an order was bought BEFORE the
        // charge; run for one of these it could refund a booking that is fine.
        if (captureFlowOf(pi.metadata) === 'authorise_first') {
            await commitEvent();
            return NextResponse.json({ received: true });
        }
```

- [ ] **Step 4: Type-check and lint**

Run: `npx tsc --noEmit; npx eslint src/app/api/webhooks/stripe/route.ts`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/webhooks/stripe/route.ts
git commit -m "feat(flights): finalise authorise-first Duffel intents from the webhook" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 12: `/confirm`

**Files:**
- Modify: `src/app/api/flights/confirm/route.ts`

- [ ] **Step 1: Add the imports**

```ts
import { captureFlowOf } from '@/lib/server/flights/capture-flow';
import { finaliseDuffelAuthorised } from '@/lib/server/flights/finalise-authorised';
import { failedBookingBody, finaliseOutcomeResponse } from '@/lib/server/flights/failure-response';
```

- [ ] **Step 2: Name the flow once**

After `const isMystifly = provider === 'mystifly_v2' || provider === 'mystifly';`, add:

```ts
        const authoriseFirst = !isMystifly && captureFlowOf(paymentIntent.metadata) === 'authorise_first';
```

- [ ] **Step 3: Answer a stored failure, not the legacy refund wording**

In "Step 2: DB-first check", replace:

```ts
            if (existingBooking.status === 'failed') {
                console.log('[/confirm] Booking already failed for session:', sessionId);
                return NextResponse.json({
                    success: false,
                    errorCode: 'booking_failed_refunded',
                    error: 'Booking failed — the flight offer was no longer available. Your payment has been automatically refunded.',
                }, { status: 400 });
            }
```

with:

```ts
            if (existingBooking.status === 'failed') {
                console.log('[/confirm] Booking already failed for session:', sessionId);
                const { data: failedSession } = await supabase
                    .from('booking_sessions')
                    .select('failure')
                    .eq('id', sessionId)
                    .maybeSingle();
                return NextResponse.json({
                    success: false,
                    ...failedBookingBody((failedSession as any)?.failure),
                }, { status: 400 });
            }
```

- [ ] **Step 4: Accept `requires_capture` for authorise-first**

In "Step 3", replace:

```ts
        } else {
            // Duffel: payment must be fully captured
            if (paymentIntent.status !== 'succeeded') {
```

with:

```ts
        } else if (authoriseFirst) {
            // Duffel, authorise-first: the card is held (requires_capture), or the webhook has
            // already bought and captured (succeeded). Anything else is not authorised.
            if (paymentIntent.status !== 'requires_capture' && paymentIntent.status !== 'succeeded') {
                return NextResponse.json(
                    { success: false, error: `Payment not authorised (status: ${paymentIntent.status})` },
                    { status: 402 },
                );
            }
        } else {
            // Duffel: payment must be fully captured
            if (paymentIntent.status !== 'succeeded') {
```

- [ ] **Step 5: Finalise instead of recording, for authorise-first**

In "Step 4", replace:

```ts
        let bookingData: any;
        try {
            bookingData = await createBooking({ sessionId });
            console.log('[/confirm] createBooking result (status', bookingData.httpStatus, '):', JSON.stringify(bookingData));
        } catch (bookingErr: any) {
```

with:

```ts
        let bookingData: any;
        try {
            if (authoriseFirst) {
                // Buys the order (if the webhook has not), captures, records. The claim makes this
                // and the webhook place one order between them.
                const outcome = await finaliseDuffelAuthorised({ sessionId, paymentIntentId });
                const answer = finaliseOutcomeResponse(outcome);
                if (answer) return NextResponse.json(answer.body, { status: answer.status });
                bookingData = { success: true, ...(outcome as Extract<typeof outcome, { kind: 'booked' }>) };
            } else {
                bookingData = await createBooking({ sessionId });
            }
            console.log('[/confirm] booking result (status', bookingData.httpStatus, '):', JSON.stringify(bookingData));
        } catch (bookingErr: any) {
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit; npx eslint src/app/api/flights/confirm/route.ts`
Expected: no errors. The existing success block below (auto-ticket, email, notification) now runs for an authorise-first booking finalised here.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/flights/confirm/route.ts
git commit -m "feat(flights): /confirm finalises authorise-first intents and reports why one was refused" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 13: `/book`, behind the flag

These are small, flag-gated edits to the live route. With the flag off, `authoriseFirst` is `false` and every changed expression evaluates to what it did before.

**Files:**
- Modify: `src/app/api/flights/book/route.ts`

- [ ] **Step 1: Imports**

After `import { canonicalBrandName } from '@/lib/brand';` add:

```ts
import { resolveCaptureFlow } from '@/lib/server/flights/capture-flow';
import { toE164Phone } from '@/lib/server/flights/duffel-order-passengers';
```

- [ ] **Step 2: Decide the flow once**

After:

```ts
        const serverFarePolicy = revalData.farePolicy || farePolicy;
        const sanitizedFlight = { ...flight };
```

add:

```ts
        // Authorise-first (ADR-0050): decided once, here, and stamped on the PaymentIntent below.
        // When on, no order is bought in this request; it is bought once the card is authorised.
        const captureFlow = provider === 'duffel' ? resolveCaptureFlow() : 'order_first';
        const authoriseFirst = captureFlow === 'authorise_first';
```

- [ ] **Step 3: Validate the phone before a card is asked**

Immediately before the comment `// ── Step 1.4 (Duffel only): did a previous attempt already buy this? ──`, add:

```ts
        // Authorise-first buys the order after the card is held, so a number Duffel would refuse
        // has to stop here, before anyone is asked for a card.
        if (authoriseFirst && !toE164Phone(contact as any).ok) {
            return NextResponse.json({
                success: false,
                errorCode: 'phone_number_invalid',
                error: 'Invalid phone number. Please enter a valid phone number with country code (e.g. for South Korea: country code 82, number 10-1234-5678).',
            }, { status: 400 });
        }
```

- [ ] **Step 4: Skip pre-order reuse and ordering**

Replace:

```ts
        // Leaving duffelPreOrder set here is what skips Step 1.5 entirely.
        if (provider === 'duffel' && (flight as any)._rawOffer?.id && env.DUFFEL_TOKEN) {
```

with:

```ts
        // Leaving duffelPreOrder set here is what skips Step 1.5 entirely.
        // (Authorise-first has no order before payment, so there is nothing to reuse.)
        if (provider === 'duffel' && !authoriseFirst && (flight as any)._rawOffer?.id && env.DUFFEL_TOKEN) {
```

and replace:

```ts
        if (provider === 'duffel' && !duffelPreOrder) {
            const rawOffer = (flight as any)._rawOffer;
            if (!rawOffer?.id) throw new Error('Duffel offer data missing — cannot book.');
```

with:

```ts
        if (provider === 'duffel' && !duffelPreOrder && !authoriseFirst) {
            const rawOffer = (flight as any)._rawOffer;
            if (!rawOffer?.id) throw new Error('Duffel offer data missing — cannot book.');
```

- [ ] **Step 5: What the card is authorised for**

Replace:

```ts
        const stripeBase = duffelPreOrder
            ? parseFloat(duffelPreOrder.orderTotal)
            : effectiveFlightTotal + Math.max(0, seatTotal ?? 0) + Math.max(0, bagTotal ?? 0);
```

with:

```ts
        const stripeBase = duffelPreOrder
            ? parseFloat(duffelPreOrder.orderTotal)
            : authoriseFirst
                // No order exists yet. The server's own arithmetic on the offer's
                // available_services, never the client's seat/bag totals, is what the card is held for.
                ? parseFloat(computeOrderTotal((flight as any)._rawOffer, seatServiceIds, bagServiceIds).total)
                : effectiveFlightTotal + Math.max(0, seatTotal ?? 0) + Math.max(0, bagTotal ?? 0);
```

and replace:

```ts
        const baseCurrency = (duffelPreOrder?.orderCurrency || settlementCurrency).toLowerCase();
```

with:

```ts
        const baseCurrency = (
            duffelPreOrder?.orderCurrency
            || (authoriseFirst ? (flight as any)._rawOffer?.total_currency : undefined)
            || settlementCurrency
        ).toLowerCase();
```

- [ ] **Step 6: Manual capture and the stamp**

Replace:

```ts
            // Duffel is the only reachable provider and its orders are placed before the
            // charge, so there is nothing to hold funds for — capture immediately.
            capture_method: 'automatic',
```

with:

```ts
            // Order-first: the order was placed before this charge, so there is nothing to hold
            // funds for and the capture is immediate. Authorise-first: the card is only held here,
            // and is captured once the order has been bought (finalise-authorised.ts).
            capture_method: authoriseFirst ? 'manual' : 'automatic',
```

Replace `                provider: provider,\n                userId: userId,` (in the PaymentIntent `metadata`) with:

```ts
                provider: provider,
                // Routing key for everything after this point; see capture-flow.ts.
                captureFlow,
                userId: userId,
```

Replace `requestParams: { amount: flightStripeAmount, currency: chargeInCurrency, captureMethod: 'automatic', markupRate: pricing.markupRate },` with:

```ts
            requestParams: { amount: flightStripeAmount, currency: chargeInCurrency, captureMethod: authoriseFirst ? 'manual' : 'automatic', markupRate: pricing.markupRate },
```

- [ ] **Step 7: Persist what ordering later needs**

In the `booking_sessions` update that follows the intent, after `payment_currency: chargeInCurrency.toUpperCase(),` add:

```ts
                // Authorise-first: what finalisation needs to place the order later, under the
                // same tolerance rule this route applies.
                ...(authoriseFirst ? { capture_method: 'manual', confirmed_price: confirmedPrice ?? null } : {}),
```

- [ ] **Step 8: Type-check and lint**

Run: `npx tsc --noEmit; npx eslint src/app/api/flights/book/route.ts`
Expected: no errors.

- [ ] **Step 9: Confirm that flag-off is unchanged**

Run: `git diff src/app/api/flights/book/route.ts`
Expected: only the hunks above. Every added expression is either a new `if (authoriseFirst …)` that cannot fire, `&& !authoriseFirst` on a condition that was `true`, or a ternary whose `false` arm is the original expression.

- [ ] **Step 10: Commit**

```bash
git add src/app/api/flights/book/route.ts
git commit -m "feat(flights): /book authorises the card without buying the order when the flag is on" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Auto-recover

Today auto-recover expires any Duffel session whose intent has not `succeeded`, which would leave a live hold on a card. For authorise-first intents it must finalise instead, and give up (release the hold) after two hours.

**Files:**
- Modify: `src/lib/server/flights/auto-recover-filter.ts`
- Modify: `src/lib/server/flights/auto-recover-filter.test.ts`
- Modify: `src/app/api/internal/auto-recover/route.ts`

- [ ] **Step 1: Add the failing test**

Append to `src/lib/server/flights/auto-recover-filter.test.ts`:

```ts
import { decideAuthorisedRecovery, AUTHORISED_HOLD_GIVE_UP_MS } from './auto-recover-filter';

describe('decideAuthorisedRecovery', () => {
    const young = 10 * 60 * 1000;
    const old = AUTHORISED_HOLD_GIVE_UP_MS + 1;

    it('finalises a held card, or one already captured, while the session is young', () => {
        expect(decideAuthorisedRecovery('requires_capture', young)).toBe('finalise');
        expect(decideAuthorisedRecovery('succeeded', young)).toBe('finalise');
    });

    it('releases a hold that has gone unfinalised for too long', () => {
        expect(decideAuthorisedRecovery('requires_capture', old)).toBe('release');
    });

    it('still records a captured booking however old the session is', () => {
        expect(decideAuthorisedRecovery('succeeded', old)).toBe('finalise');
    });

    it('expires a session whose card was never authorised or whose intent is gone', () => {
        expect(decideAuthorisedRecovery('requires_payment_method', young)).toBe('expire');
        expect(decideAuthorisedRecovery('requires_confirmation', young)).toBe('expire');
        expect(decideAuthorisedRecovery('canceled', young)).toBe('expire');
    });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run src/lib/server/flights/auto-recover-filter.test.ts`
Expected: FAIL, `decideAuthorisedRecovery` is not exported.

- [ ] **Step 3: Implement**

Append to `src/lib/server/flights/auto-recover-filter.ts`:

```ts
/** A held card that nobody finalised within this long is released rather than left for days. */
export const AUTHORISED_HOLD_GIVE_UP_MS = 2 * 60 * 60 * 1000;

export type AuthorisedRecovery = 'finalise' | 'release' | 'expire';

/**
 * What auto-recover does with a session whose Duffel intent was created authorise-first.
 *
 * `requires_capture` is the card held and the booking not made (the webhook and /confirm both
 * missed): finalising is safe, because the claim makes it place one order. An intent that never
 * got as far as a held card has nothing to finalise or release.
 */
export function decideAuthorisedRecovery(piStatus: string, sessionAgeMs: number): AuthorisedRecovery {
    if (piStatus === 'succeeded') return 'finalise';
    if (piStatus === 'requires_capture') {
        return sessionAgeMs > AUTHORISED_HOLD_GIVE_UP_MS ? 'release' : 'finalise';
    }
    return 'expire';
}
```

- [ ] **Step 4: Run and see it pass**

Run: `npx vitest run src/lib/server/flights/auto-recover-filter.test.ts`
Expected: PASS (the existing tests and 4 new ones).

- [ ] **Step 5: Use it in the route**

In `src/app/api/internal/auto-recover/route.ts`, add imports:

```ts
import { shouldRecoverSession, decideAuthorisedRecovery } from '@/lib/server/flights/auto-recover-filter';
import { captureFlowOf } from '@/lib/server/flights/capture-flow';
import { finaliseDuffelAuthorised } from '@/lib/server/flights/finalise-authorised';
import { completeDuffelBooking } from '@/lib/server/flights/post-booking';
import { cancelDuffelOrder } from '@/lib/server/flights/duffel-cancel';
```

(replacing the existing `shouldRecoverSession` import line). Add the staked order id to the query's columns, replacing:

```ts
            .select('id, provider, payment_intent_id, status, created_at, contact')
```

with:

```ts
            .select('id, provider, payment_intent_id, status, created_at, contact, duffel_pre_order_id')
```

Inside the `for (const session of mismatches)` loop, directly after `const pi = await stripe.paymentIntents.retrieve(session.payment_intent_id);`, insert:

```ts
                    // Authorise-first Duffel intents: a held card is finalised or released, never
                    // "expired" while the hold is still on the traveller's card.
                    if (session.provider === 'duffel' && captureFlowOf(pi.metadata) === 'authorise_first') {
                        const ageMs = Date.now() - new Date(session.created_at).getTime();
                        const decision = decideAuthorisedRecovery(pi.status, ageMs);

                        if (decision === 'finalise') {
                            const outcome = await finaliseDuffelAuthorised({ sessionId: session.id, paymentIntentId: pi.id });
                            if (outcome.kind === 'booked') {
                                if (!outcome.alreadyBooked) {
                                    await completeDuffelBooking({
                                        supabase, sessionId: session.id,
                                        paymentIntent: { id: pi.id, amount: pi.amount, currency: pi.currency },
                                        booking: outcome,
                                    });
                                }
                                recovered++;
                            } else if (outcome.kind === 'refused') {
                                failed++;
                            }
                            // in_progress and not_authorised: another path owns it; look again next run.
                            continue;
                        }

                        // Giving up on this session. An order that was bought and staked but never
                        // captured is ours to cancel too, or the seat stays bought with nothing
                        // paid for it. A session already marked failed had its order handled (or
                        // alerted) when it failed.
                        if (session.duffel_pre_order_id && session.status !== 'failed' && env.DUFFEL_TOKEN) {
                            await cancelDuffelOrder(env.DUFFEL_TOKEN, session.duffel_pre_order_id, 'authorise-first hold released without a booking');
                        }
                        if (decision === 'release') {
                            console.warn(`[auto-recover] Releasing unfinalised hold ${pi.id} (session ${session.id}, ${Math.round(ageMs / 60000)} min old)`);
                            try { await stripe.paymentIntents.cancel(pi.id); } catch (cancelErr: any) {
                                console.error(`[auto-recover] Could not release hold ${pi.id}:`, cancelErr?.message ?? cancelErr);
                            }
                        }
                        await supabase.from('booking_sessions').update({ status: 'expired' }).eq('id', session.id);
                        continue;
                    }
```

- [ ] **Step 6: Type-check and commit**

Run: `npx tsc --noEmit; npx eslint src/app/api/internal/auto-recover/route.ts`
Expected: no errors.

```bash
git add src/lib/server/flights/auto-recover-filter.ts src/lib/server/flights/auto-recover-filter.test.ts src/app/api/internal/auto-recover/route.ts
git commit -m "feat(flights): auto-recover finalises or releases held Duffel cards instead of expiring them" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 15: The price-change prompt after authorisation

**Files:**
- Create: `src/lib/flights/price-change-failure.ts`
- Test: `src/lib/flights/price-change-failure.test.ts`
- Modify: `src/hooks/flights/useFlightBooking.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { priceChangeFromFailure } from './price-change-failure';

describe('priceChangeFromFailure', () => {
    it('reads the new fare out of a refusal', () => {
        expect(priceChangeFromFailure({
            errorCode: 'price_changed', priceChange: { oldPrice: 100, newPrice: 110.5, currency: 'USD' },
        })).toEqual({ oldPrice: 100, newPrice: 110.5, currency: 'USD' });
    });

    it('is null for any other failure', () => {
        expect(priceChangeFromFailure({ errorCode: 'flight_unavailable' })).toBeNull();
        expect(priceChangeFromFailure(null)).toBeNull();
        expect(priceChangeFromFailure(undefined)).toBeNull();
    });

    it('is null when the numbers are missing or not numbers, rather than prompting "NaN"', () => {
        expect(priceChangeFromFailure({ errorCode: 'price_changed' })).toBeNull();
        expect(priceChangeFromFailure({ errorCode: 'price_changed', priceChange: { oldPrice: 'x', newPrice: 1, currency: 'USD' } })).toBeNull();
        expect(priceChangeFromFailure({ errorCode: 'price_changed', priceChange: { oldPrice: 1, newPrice: 2 } })).toBeNull();
    });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run src/lib/flights/price-change-failure.test.ts`
Expected: FAIL, module unresolved.

- [ ] **Step 3: Implement**

```ts
export interface PriceChangeData {
    oldPrice: number;
    newPrice: number;
    currency: string;
}

/**
 * The new fare, when a failure after authorisation was "the price moved".
 *
 * Returned by /confirm and /booking-status as `{ errorCode: 'price_changed', priceChange }`. Null
 * for anything else, and for a malformed one: prompting a traveller with "NaN" is worse than the
 * generic failure screen.
 */
export function priceChangeFromFailure(data: any): PriceChangeData | null {
    if (data?.errorCode !== 'price_changed') return null;
    const change = data.priceChange;
    if (
        typeof change?.oldPrice !== 'number' || !Number.isFinite(change.oldPrice)
        || typeof change?.newPrice !== 'number' || !Number.isFinite(change.newPrice)
        || typeof change?.currency !== 'string' || change.currency.length === 0
    ) return null;
    return { oldPrice: change.oldPrice, newPrice: change.newPrice, currency: change.currency };
}
```

- [ ] **Step 4: Run and see it pass**

Run: `npx vitest run src/lib/flights/price-change-failure.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Use it in the hook**

In `src/hooks/flights/useFlightBooking.ts`, add the import:

```ts
import { priceChangeFromFailure } from '@/lib/flights/price-change-failure';
```

In `pollForBooking`, in the `if (winner.type === 'poll')` branch, replace:

```ts
            if (d.failed) {
                clearRecovery();
                setErrorMsg(d.errorCode ? 'CODE:' + d.errorCode : (d.error || 'CODE:booking_failed_refunded'));
```

with:

```ts
            if (d.failed) {
                clearRecovery();
                // Authorised, then the fare moved: the hold is already released, so offer the new
                // price on the form, exactly as a change found before payment would.
                const moved = priceChangeFromFailure(d);
                if (moved) {
                    setPriceChangedData(moved);
                    setErrorMsg('');
                    setStep('form');
                    idempotencyKeyRef.current = generateId();
                    return;
                }
                setErrorMsg(d.errorCode ? 'CODE:' + d.errorCode : (d.error || 'CODE:booking_failed_refunded'));
```

and in the confirm branch, replace:

```ts
        if (!data || !ok || data.success === false) {
            const errMsg = data?.errorCode ? 'CODE:' + data.errorCode : (data?.error || 'CODE:booking_card_not_charged');
```

with:

```ts
        if (!data || !ok || data.success === false) {
            const moved = priceChangeFromFailure(data);
            if (moved) {
                clearRecovery();
                setPriceChangedData(moved);
                setErrorMsg('');
                setStep('form');
                idempotencyKeyRef.current = generateId();
                return;
            }
            const errMsg = data?.errorCode ? 'CODE:' + data.errorCode : (data?.error || 'CODE:booking_card_not_charged');
```

- [ ] **Step 6: Type-check, lint, run the hook's neighbours**

Run: `npx tsc --noEmit; npx eslint src/hooks/flights/useFlightBooking.ts; npx vitest run src/hooks src/lib/flights`
Expected: no errors; existing tests pass.

If `generateId` or `setPriceChangedData` is not in scope inside `pollForBooking` (it is a `useCallback(…, [])`), use the same identifiers the surrounding `onError` handler uses, which are module- or hook-level and stable, and keep the dependency array empty.

- [ ] **Step 7: Commit**

```bash
git add src/lib/flights/price-change-failure.ts src/lib/flights/price-change-failure.test.ts src/hooks/flights/useFlightBooking.ts
git commit -m "feat(flights): offer the new fare when it moves after the card is authorised" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Documentation

**Files:**
- Create: `docs/adr/0050-duffel-flights-authorise-the-card-before-the-order-is-bought.md`
- Modify: `CONTEXT.md`

ADRs 0047–0049 exist on `feat/golf-courses`; 0050 is used here so the two branches do not collide.

- [ ] **Step 1: Write the ADR**

```markdown
# Duffel flights authorise the card before the order is bought

A Duffel flight is booked by holding the traveller's card, buying the order, and only then
capturing. Until now the order was bought first, from our own Duffel balance, and the card was
asked afterwards. A declined card therefore always arrived after we had spent the money, and every
such case was a cancellation we had to win with the supplier.

**Authorise, buy, capture.** `/book` creates the PaymentIntent with `capture_method: 'manual'` and
buys nothing. When the card is held (`requires_capture`) the Stripe webhook, or `/confirm` as its
fallback, buys the order and captures; a refusal cancels the intent, which releases the hold and
moves no money. Mystifly has always worked this way; this makes Duffel follow it.

**The flow is decided once and stamped on the intent.** `DUFFEL_MANUAL_CAPTURE=on` is read when
the intent is created and recorded as `captureFlow` in its metadata. Everything afterwards routes
by that stamp, so turning the flag off cannot strand a payment already in flight, and intents
created before the flag existed keep the old path with no migration of data.

**A small rise is ours; a large one is the traveller's to accept.** The card is held for a fixed
amount and can be captured for less but never more. A fare that rises by no more than the existing
price tolerance between the hold and the order is absorbed and the traveller is charged what they
saw; above it the hold is released and the new fare is offered. A fare that falls is passed on.

**One claim places one order.** Finalisation is reachable from the webhook, `/confirm` and
auto-recover. The session is claimed atomically (`ordering`), a stale claim can be taken over after
eight minutes, and the order id is written to the session the moment the order exists, so a crash
leaves something the next claimer or the orphan sweep can find. Two authorisations of the same
journey by the same traveller are refused; the second hold is released.

## Considered options

- **Authorise first (chosen).** Covers every offer, needs no second booking flow, and the failure
  mode of a declined card becomes "nothing was bought".
- **Duffel hold orders.** Measured on test credentials only 15–78% of offers allow them (MNL→ICN
  49%, CRK→LHR 15%, MNL→SIN 78%): a second flow for half the traffic, with its own deadlines, and
  instant orders would still need the same safeguards.
- **Keep ordering first and improve cancellation.** Leaves us paying for every decline and
  depending on the supplier's goodwill to get it back.

## Consequences

- Customers see a pending hold, then a capture. Support should know.
- The offer is older when it is bought, by the length of the card step (3DS included). If it has
  expired the hold is released and the traveller is told they were not charged; the refusal codes
  are logged so the effect on conversion can be measured.
- If the order is bought and capture then fails, we cancel the order and alert the team.
  Cancelling an instant order may not recover the fare; that case is rare because the card was
  already authorised.
- The order-first path stays until the flag has run clean, then is deleted with pre-order reuse.
- The mobile routes keep the old flow until their client is checked against `requires_capture`.
```

- [ ] **Step 2: Add the glossary entry**

In `CONTEXT.md`, insert directly after the line that begins `**Flight Provider** —`:

```markdown
**Authorise-first** — how a Duffel flight is paid for when `DUFFEL_MANUAL_CAPTURE=on`: the traveller's card is held, then the Duffel order is bought, then the hold is captured. A refusal at the order step releases the hold and nothing is charged. The flow an intent was created under is stamped on it as `captureFlow` and every later step routes by that stamp (`capture-flow.ts`), never by the current flag. Contrast **order-first**, the previous flow, in which the order was bought from the Duffel balance before the card was asked (ADR-0050).
_Avoid_: reading the flag after the intent exists. Flipping it mid-flight would send an authorised card down the path that expects a captured one.
```

- [ ] **Step 3: Commit**

```bash
git add docs/adr/0050-duffel-flights-authorise-the-card-before-the-order-is-bought.md CONTEXT.md
git commit -m "docs(flights): ADR-0050 and glossary entry for authorise-first" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 17: Whole-suite check and sandbox acceptance

- [ ] **Step 1: Run everything that touches flights**

Run: `npx tsc --noEmit; npx vitest run src/lib/server/flights src/lib/flights src/hooks src/lib/pricing-tolerance.test.ts`
Expected: no type errors; all tests pass (integration tests skip without `DATABASE_URL`).

- [ ] **Step 2: Lint the changed files**

Run: `npx eslint src/lib/server/flights src/lib/flights src/hooks/flights src/app/api/flights src/app/api/webhooks/stripe src/app/api/internal/auto-recover`
Expected: no errors.

- [ ] **Step 3: Flag off behaves as before (manual, Duffel sandbox, Stripe test mode)**

With `DUFFEL_MANUAL_CAPTURE` unset, book a sandbox flight with card `4242 4242 4242 4242`.
Expected:
1. The Duffel order exists before the card step (visible in the Duffel dashboard at the "Pay" click).
2. Stripe shows the PaymentIntent as `Succeeded` with automatic capture; no `captureFlow` metadata of `authorise_first`.
3. The trips page shows the booking with a PNR, and the confirmation email arrives.

- [ ] **Step 4: Flag on, card declined**

Set `DUFFEL_MANUAL_CAPTURE=on`, restart the server, book with `4000 0000 0000 0002` (declined).
Expected: the decline appears on the card form; **no Duffel order exists** in the dashboard; the intent is not captured.

- [ ] **Step 5: Flag on, card authorised**

Book with `4242 4242 4242 4242`.
Expected, in this order:
1. Stripe shows the intent `Uncaptured`, metadata `captureFlow: authorise_first`.
2. A Duffel order appears.
3. The intent becomes `Succeeded` for the same amount (or lower).
4. The booking page shows a PNR; one confirmation email; one ledger entry; session `booked`.

- [ ] **Step 6: Flag on, 3DS**

Book with `4000 0027 6000 3184` and complete the challenge.
Expected: as Step 5. The order is bought after the challenge, not before.

- [ ] **Step 7: Flag on, offer gone**

In the sandbox, book an offer id that has expired (let a result page sit past `expires_at`, or use an offer id that was already booked).
Expected: the failure screen says the flight is no longer available and the card was not charged; the intent is `Canceled`; no Duffel order exists; `booking_sessions.failure` holds `{"errorCode":"flight_unavailable"}`.

- [ ] **Step 8: Flag on, duplicate authorisation**

Open the same booking in two tabs and pay in both.
Expected: one ticket and one capture; the second intent is `Canceled` and its tab shows the duplicate-booking message.

- [ ] **Step 9: Flag on, webhook missed**

Stop the webhook listener (or block `/api/webhooks/stripe`), pay with `4242…`, and close the tab before `/confirm` fires. Then call the recovery job:

```powershell
curl.exe -X POST -H "Authorization: Bearer $env:CRON_SECRET" http://localhost:3000/api/internal/auto-recover
```

(`CRON_SECRET` or `FUNCTIONS_SECRET`, as the route accepts. The session must be more than 5 minutes old.)
Expected: `recovered: 1`; the order exists, the intent is captured, the booking is recorded, the email is sent.

- [ ] **Step 10: Roll back**

Unset `DUFFEL_MANUAL_CAPTURE` and restart; repeat Step 3.
Expected: behaves as in Step 3. An intent left authorised from Step 5 or 9 still finishes by its stamp.

- [ ] **Step 11: Record the result**

Append a short dated note to the end of `docs/superpowers/specs/2026-10-12-duffel-authorise-first-design.md` under a new `## Acceptance` heading listing which of Steps 3–10 were run, in which environment, and what was seen. Commit:

```bash
git add docs/superpowers/specs/2026-10-12-duffel-authorise-first-design.md
git commit -m "docs(flights): record sandbox acceptance for authorise-first" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Not in this plan

- The mobile routes (`api/mobile/flights/book` and its confirm). They keep the order-first flow regardless of the flag. They need their own client verified against `requires_capture` first; because they already import `place-duffel-order.ts`, the follow-up is small.
- Deleting the legacy order-first code in `/book`, pre-order reuse, and the inline error mapper. This waits until the flag has run clean in live.
- Turning the flag on in production. That is an operational decision after Step 7–9 have passed in sandbox.

---

## Execution notes (2026-10-13)

Tasks 1–16 were executed as written, plus Task 17 steps 1–2. These are the places the code
differs from what the plan text above shows, in the order they were found.

1. **Task 8, dependencies are built lazily.** The plan's `{ ...defaultDeps(), ...overrides }`
   reached for the database and Stripe even when every dependency was injected, so all 18 unit
   tests failed with `DATABASE_URL is not set`. `finalise-authorised.ts` now has
   `defaultFactories` and `resolveDeps`, which build a default only for what was not overridden.
2. **Task 9, `booking-status` reads the session's failure directly.** The plan read it only when a
   failed booking row was found, but that row is written by `markFailed` without a `user_id` and
   the route filters by user, so the poll could never see an authorise-first refusal; only
   `/confirm` would. The route now reads `booking_sessions.failure` (scoped to the user) in
   parallel and answers from it when there is no visible row.
3. **Task 14, recovery waits for a traveller who is still paying.** The plan expired any
   `authorise_first` session whose intent had not reached `requires_capture`. Auto-recover looks
   at sessions older than 5 minutes, and a 3DS challenge can be well inside that, so the session
   would have been expired under the traveller and their later authorisation left as a hold
   nobody finalises. `decideAuthorisedRecovery` now has `wait` (still within the 30-minute session
   plus a margin) and `release` (past it: cancel the intent so a late payment cannot leave a
   hold), and `expire` is only for an intent that is already cancelled.
4. **Task 3** produced 9 tests, not 8. **Task 4** was written implementation-alongside-test
   rather than with a separate red run (the module did not exist, so it could only fail on the
   import).
5. **Task 13, one observable change with the flag off:** new intents carry
   `captureFlow: 'order_first'` in their metadata. Nothing reads it as anything but order-first,
   and an intent with no stamp is treated identically.

### Observed, not changed

- The legacy `payment_intent.canceled`/`payment_failed` handler in the webhook writes
  `status: 'payment_failed'`, which is not in `booking_sessions_status_check`, so that update is
  rejected and the error is not looked at. Pre-existing; unrelated to this change.
- `markFailed` inserts the failed `flight_bookings` row without a `user_id`, which is why the
  user-scoped status poll has never been able to see a legacy failure either.

### Not run

Task 17 steps 3–10 (sandbox acceptance with Stripe test cards and the Duffel sandbox) need a
browser, the sandbox credentials and a running app, and were not run.
