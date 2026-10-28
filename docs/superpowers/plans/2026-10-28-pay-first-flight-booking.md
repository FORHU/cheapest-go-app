# Pay-first Flight Booking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the web, buy the Duffel airline order only after Stripe has authorised the card, so a back-click during submit can no longer buy a second ticket.

**Architecture:** Behind `FLIGHT_PAY_FIRST`, `/api/flights/book` only prices the trip, get-or-creates a `booking_sessions` row keyed by a `quote_hash`, and creates a manual-capture PaymentIntent. When Stripe reports the card authorised, `createBooking` (already the single locked path used by the webhook and `/confirm`) places the Duffel order, captures the real amount, then books as today. A failed order releases the hold, records the reason on the failed `flight_bookings` row and emails the traveller.

**Tech Stack:** Next.js 15 route handlers, React 19, TanStack Query 5, Stripe (`capture_method: 'manual'`), Duffel REST, postgres.js + a supabase-style admin client, Vitest (`globals: true`, happy-dom), next-intl locales (`en`, `zh`, `ko`, `ja`).

Spec: `docs/superpowers/specs/2026-10-28-pay-first-flight-booking-design.md`

**Conventions used throughout**
- Run one test file: `npx vitest run <path>`. Run everything: `npx vitest run`.
- New server logic is written as plain functions that take their collaborators (`deps`), like `cancelDuffelOrder(…, fetchImpl)` already does. Wiring to the real database and Stripe lives in separate `*-deps.ts` files so tests never import `@/lib/stripe/server`.
- Commit after every task. Every commit message ends with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (the examples below omit it for brevity; add it).
- Local DB: `docker exec -i cheapest-go-app-postgres-1 psql -U cheapestgo -d cheapestgo -X -P pager=off`. Start Docker Desktop first if `docker ps` fails.

**Findings that shaped this plan (verified while planning)**
1. `placeDuffelOrder` (`src/lib/server/flights/place-duffel-order.ts`) is **imported but never called** by the mobile route. It lags the web route's inline logic in two ways this flow depends on, fixed in Task 1: its timeout-recovery reads `.orderId`/`.tickets` off a *raw* Duffel order (undefined, so `.tickets.map` throws), and its expired-offer refresh matches on carrier and price proximity instead of `sameItineraryOffers`. A third divergence (price-changed amounts reported as totals, not bare fares) does not matter here because pay-first never asks the traveller to confirm a new fare.
2. `email_logs` rejects unknown `email_type` values (CHECK constraint) and dedups on `(booking_id, email_type)`, so the failure email needs a `flight_bookings` row to attach to. `markFailed` in `create-booking.ts` already inserts a `failed` row; Task 8 reuses it.
3. There is no migration runner in `package.json` or `scripts/`. This plan applies the migration to the local DB with `psql`; **how staging and production apply `db/migrations/*.sql` must be confirmed by the owner before rollout.**
4. The Stripe webhook's `payment_intent.canceled` branch only cancels a Duffel order when the PaymentIntent metadata has `duffelOrderId`. Pay-first PaymentIntents deliberately carry none, so releasing a hold cannot trigger a stray order cancel.
5. `FlightBookContent` shows a 4-step animated progress screen. The copy change keeps that machinery and changes the labels, heading and the "don't close this page" line.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/server/flights/place-duffel-order.ts` (modify) | Resilient order placement; brought to parity with the web route |
| `src/lib/server/flights/duffel-order-error.ts` (create) | Map a failed Duffel order response to `{ code, message }` |
| `src/lib/server/flights/duffel-order-passengers.ts` (create) | Build Duffel order passengers and E.164 phone from stored session data |
| `src/lib/server/flights/flight-quote.ts` (create) | `computeOrderTotal`, `quoteHash` |
| `src/lib/server/flights/capture-decision.ts` (create) | Pure price-drift rule: capture how much, or release |
| `src/lib/server/flights/pay-first-flag.ts` (create) | `isPayFirstEnabled()` |
| `src/lib/server/flights/booking-failure.ts` (create) | Failure-reason read/write on `cancellation_log`, shared response shape |
| `src/lib/server/flights/booking-not-completed-copy.ts` (create) | Reason sentences and segment mapping for the failure email (pure) |
| `db/migrations/20261028000001_pay_first_flight_booking.sql` (create) | `quote_hash` column + unique index, email type |
| `src/lib/server/flights/pay-first-payment.ts` (create) | Quote, get-or-create session, create/reuse PaymentIntent (injectable deps) |
| `src/lib/server/flights/pay-first-deps.ts` (create) | Real DB and Stripe wiring for the above |
| `src/app/api/flights/book/route.ts` (modify) | Flagged early branch into pay-first |
| `src/lib/server/flights/settle-authorized-flight.ts` (create) | Place order, save it, capture or release (injectable deps) |
| `src/lib/server/flights/settle-deps.ts` (create) | Real Stripe/Duffel/DB wiring for settle |
| `src/lib/server/flights/create-booking.ts` (modify) | Call settle when the session has no order; failure bookkeeping |
| `src/lib/server/email.ts` (modify) | `booking_not_completed` email |
| `src/app/api/webhooks/stripe/route.ts` (modify) | Handle `amount_capturable_updated` for pay-first Duffel |
| `src/app/api/flights/confirm/route.ts` (modify) | Accept `requires_capture`; failure reason passthrough |
| `src/app/api/flights/booking-status/route.ts` (modify) | Return failure reason |
| `src/hooks/flights/useFlightBooking.ts` (modify) | 150 s poll window, `failureReason` |
| `src/app/(main)/flights/book/FlightBookContent.tsx` (modify) | Waiting copy, new error codes |
| `src/locales/{en,zh,ko,ja}.json` (modify) | New/changed `flightBook` strings |
| `docs/adr/0045-…md`, `.env.example` (create/modify) | Decision record and flag |

---

## Task 1: Bring `placeDuffelOrder` to parity with the web route

**Files:**
- Modify: `src/lib/server/flights/place-duffel-order.ts` (header comment, line 31, line 23-25 imports, lines ~165-175, lines 337-353)
- Test: `src/lib/server/flights/place-duffel-order.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/server/flights/place-duffel-order.test.ts` (the file already defines `RAW_OFFER`, `PAX` and the `duffel()` router helper at the top; reuse them):

```ts
describe('placeDuffelOrder — an order that timed out but landed', () => {
    afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

    it('adopts the raw order Duffel already created instead of throwing', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
        const landed = {
            id: 'ord_landed', booking_reference: 'ABC123', total_amount: '100.00', total_currency: 'USD',
            created_at: new Date(Date.now() + 1000).toISOString(),
            slices: [{ origin: { iata_code: 'MNL' }, destination: { iata_code: 'HKG' } }],
            passengers: [{ family_name: 'Sandbox' }],
            documents: [{ type: 'electronic_ticket', unique_identifier: '1234567890' }],
        };
        vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
            if (init?.method === 'POST' && url.endsWith('/air/orders')) throw abort;
            if (url.startsWith('https://api.duffel.com/air/orders?limit=50')) {
                return new Response(JSON.stringify({ data: [landed] }), { status: 200 });
            }
            return new Response('{}', { status: 404 });
        }));

        const result = await placeDuffelOrder({
            duffelToken: 'duffel_test_abc',
            rawOffer: { ...RAW_OFFER, slices: [{ origin: { iata_code: 'MNL' }, destination: { iata_code: 'HKG' } }] },
            passengers: PAX, total: '100.00', currency: 'USD', priceTolerance: 10, idempotencyKey: 'idem-timeout',
        });

        expect(result.kind).toBe('success');
        if (result.kind === 'success') {
            expect(result.order.id).toBe('ord_landed');
            expect(result.order.booking_reference).toBe('ABC123');
            expect(result.order.documents).toHaveLength(1);
        }
    });
});

describe('placeDuffelOrder — refreshing an expired offer', () => {
    afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

    const segment = (departing: string) => ({
        marketing_carrier: { iata_code: 'PR' }, marketing_carrier_flight_number: '300',
        origin: { iata_code: 'MNL' }, destination: { iata_code: 'HKG' },
        departing_at: departing, passengers: [{ cabin_class: 'economy' }],
    });
    const offer = (id: string, total: string, departing: string) => ({
        id, total_amount: total, total_currency: 'USD', passengers: [{ id: 'pas_1' }],
        slices: [{ origin: { iata_code: 'MNL' }, destination: { iata_code: 'HKG' }, departure_date: departing.slice(0, 10), segments: [segment(departing)] }],
    });
    const chosen = offer('off_1', '100.00', '2026-11-01T06:00:00');

    function expiresThenSucceeds() {
        let calls = 0;
        return () => (++calls === 1
            ? { status: 422, body: { errors: [{ code: 'offer_no_longer_available' }] } }
            : { status: 201, body: { data: { id: 'ord_refreshed' } } });
    }

    it('books the same journey, not a different departure the same carrier happens to sell', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const orders = duffel([
            ['POST', '/air/orders', expiresThenSucceeds()],
            // A 22:00 departure at exactly the chosen price would win a "closest price" sort.
            ['POST', '/air/offer_requests', () => ({ status: 201, body: { data: { id: 'orq_1', offers: [
                offer('off_wrong', '100.00', '2026-11-01T22:00:00'),
                offer('off_same', '104.00', '2026-11-01T06:00:00'),
            ] } } })],
        ]);

        const result = await placeDuffelOrder({
            duffelToken: 'duffel_test_abc', rawOffer: chosen, passengers: PAX, total: '100.00', currency: 'USD',
            priceTolerance: 10, idempotencyKey: 'idem-refresh',
        });

        expect(result.kind).toBe('success');
        expect(orders).toHaveLength(2);
        expect(orders[1].selected_offers).toEqual(['off_same']);
    });

    it('reports the flight unavailable rather than substituting a different one', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const orders = duffel([
            ['POST', '/air/orders', () => ({ status: 422, body: { errors: [{ code: 'offer_no_longer_available' }] } })],
            ['POST', '/air/offer_requests', () => ({ status: 201, body: { data: { id: 'orq_1', offers: [
                offer('off_wrong', '100.00', '2026-11-01T22:00:00'),
            ] } } })],
        ]);

        const result = await placeDuffelOrder({
            duffelToken: 'duffel_test_abc', rawOffer: chosen, passengers: PAX, total: '100.00', currency: 'USD',
            priceTolerance: 10, idempotencyKey: 'idem-none',
        });

        expect(result.kind).toBe('error');
        expect(orders).toHaveLength(1);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/server/flights/place-duffel-order.test.ts`
Expected: the timeout test FAILS with `TypeError: Cannot read properties of undefined (reading 'map')`; the "same journey" test FAILS because `orders[1].selected_offers` is `['off_wrong']`; the "unavailable" test FAILS because a second order is placed (`orders` has length 2). The two pre-existing tests still pass.

- [ ] **Step 3: Implement the fixes**

In `src/lib/server/flights/place-duffel-order.ts`:

1. Replace the outdated header note. Old:
```
 * NOTE: the web /api/flights/book route still has its own inline copy of this logic.
 * It should be migrated onto this helper in a follow-up (with sandbox QA) so the two
 * booking paths can't drift.
```
New:
```
 * NOTE: the web /api/flights/book route still has its own inline copy of this logic,
 * used while FLIGHT_PAY_FIRST is off. The pay-first flow calls THIS helper, so it has to
 * stay at parity with that copy — in particular exact-itinerary matching on a refresh and
 * recovery of an order whose request timed out.
```

2. Export the timeout constant (the client's poll window is asserted against it). Old: `const DEFAULT_ORDER_TIMEOUT_MS = 130_000;` New: `export const DEFAULT_ORDER_TIMEOUT_MS = 130_000;`

3. Add the import after `import { withDuffelServicePrices } from './duffel-service-prices';`:
```ts
import { sameItineraryOffers } from './offer-itinerary-match';
```

4. Fix the timeout recovery. `findOrderFromTimedOutAttempt` resolves to the **raw** Duffel order. Old:
```ts
                    console.warn(`[placeDuffelOrder] Timed-out attempt succeeded — adopting order ${recovered.orderId} (${recovered.pnr})`);
```
New:
```ts
                    console.warn(`[placeDuffelOrder] Timed-out attempt succeeded — adopting order ${recovered.id} (${recovered.booking_reference})`);
```
Old:
```ts
                        data: { data: { id: recovered.orderId, booking_reference: recovered.pnr, documents: recovered.tickets.map((t: string) => ({ type: 'electronic_ticket', unique_identifier: t })) } },
```
New:
```ts
                        // The raw order, as a normal 201 would carry it: callers read slices,
                        // passengers and documents off it.
                        data: { data: recovered },
```

5. Replace the carrier-and-price pool with exact-itinerary matching. Old (the whole block from `const targetCarrier` to the closing `);` of `sortedPool`):
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
New:
```ts
        // The same journey only: marketing carrier, flight number and departure instant,
        // segment by segment, cheapest first. A carrier-and-price match is not identity — it
        // can ticket a 22:00 departure for someone who chose 06:00. Nothing matching means the
        // flight is unavailable, not that a different one should be bought.
        const sortedPool = sameItineraryOffers(rawOffer, offers);
        if (sortedPool.length === 0) return { kind: 'error', status: 422, data: attempt1.data };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/server/flights/place-duffel-order.test.ts`
Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/flights/place-duffel-order.ts src/lib/server/flights/place-duffel-order.test.ts
git commit -m "fix: bring placeDuffelOrder to parity with the web route (timeout recovery, exact itinerary)"
```

---

## Task 2: Duffel order error mapping and order passengers

**Files:**
- Create: `src/lib/server/flights/duffel-order-error.ts`, `src/lib/server/flights/duffel-order-passengers.ts`
- Test: `src/lib/server/flights/duffel-order-error.test.ts`, `src/lib/server/flights/duffel-order-passengers.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/lib/server/flights/duffel-order-error.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { mapDuffelOrderError } from './duffel-order-error';

const err = (code: string, message = '') => ({ errors: [{ code, message }] });

describe('mapDuffelOrderError', () => {
    it.each([
        [422, err('offer_no_longer_available'), 'flight_unavailable'],
        [422, err('x', 'This offer has expired'), 'flight_unavailable'],
        [422, err('insufficient_balance'), 'balance_insufficient'],
        [422, err('x', 'Insufficient balance on account'), 'balance_insufficient'],
        [422, err('x', 'phone_number is invalid'), 'phone_number_invalid'],
        [422, err('x', 'The seat you selected is not available'), 'seats_unavailable'],
        [504, { errors: [{ code: 'timeout', message: 'Airline booking system timed out.' }] }, 'supplier_outage'],
        [500, {}, 'supplier_outage'],
        [400, err('x', 'something unrecognised'), 'booking_failed'],
        [400, {}, 'booking_failed'],
    ])('status %s %j -> %s', (status, data, code) => {
        expect(mapDuffelOrderError(status as number, data).code).toBe(code);
    });

    it('prefers a balance problem over an "expired" reading of the same 422', () => {
        expect(mapDuffelOrderError(422, err('insufficient_balance', 'offer expired')).code).toBe('balance_insufficient');
    });

    it('carries Duffel wording for an unrecognised failure, and a fallback when there is none', () => {
        expect(mapDuffelOrderError(400, err('x', 'Passport number invalid')).message).toBe('Passport number invalid');
        expect(mapDuffelOrderError(400, {}).message).toBe('Flight booking failed. Please try again.');
    });
});
```

`src/lib/server/flights/duffel-order-passengers.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildDuffelOrderPassengers } from './duffel-order-passengers';

const rawOffer = { id: 'off_1', passengers: [{ id: 'pas_a' }, { id: 'pas_b' }] };
const pax = [
    { firstName: 'Ana', lastName: 'Cruz', birthDate: '1990-02-03', gender: 'F', type: 'ADT' },
    { firstName: 'Bo', lastName: 'Cruz', birthDate: '2018-05-06', gender: 'M', type: 'CHD' },
];
const contact = { email: 'ana@example.com', phone: '0917 123 4567', countryCode: '+63' };

describe('buildDuffelOrderPassengers', () => {
    it('maps each passenger onto the offer passenger id at the same position', () => {
        const r = buildDuffelOrderPassengers(rawOffer, pax, contact);
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.passengers.map(p => p.id)).toEqual(['pas_a', 'pas_b']);
            expect(r.passengers[0]).toMatchObject({ given_name: 'Ana', family_name: 'Cruz', born_on: '1990-02-03', email: 'ana@example.com', gender: 'f' });
        }
    });

    it('builds E.164 from the country code and a phone without its trunk zero', () => {
        const r = buildDuffelOrderPassengers(rawOffer, pax, contact);
        if (r.ok) expect(r.passengers[0].phone_number).toBe('+639171234567');
    });

    it('titles adults by gender and children as mr/miss', () => {
        const r = buildDuffelOrderPassengers(rawOffer, pax, contact);
        if (r.ok) expect(r.passengers.map(p => p.title)).toEqual(['ms', 'mr']);
    });

    it('refuses a phone number that cannot be E.164', () => {
        const r = buildDuffelOrderPassengers(rawOffer, pax, { ...contact, phone: '12' });
        expect(r).toMatchObject({ ok: false, code: 'phone_number_invalid' });
    });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/server/flights/duffel-order-error.test.ts src/lib/server/flights/duffel-order-passengers.test.ts`
Expected: FAIL — "Failed to resolve import" for both modules.

- [ ] **Step 3: Implement**

`src/lib/server/flights/duffel-order-error.ts` (the rules are the ones in `/api/flights/book`'s inline error mapper, lifted so both paths can share them later):
```ts
/**
 * Turn a failed Duffel `POST /air/orders` answer into a stable code and a sentence.
 *
 * Match on Duffel's error code, not on the bare 422 status: Duffel answers 422 for every
 * rejected order — an expired offer, but equally a malformed passport number — so treating
 * the status alone as "expired" reported a stale fare for problems unrelated to the fare.
 * A balance problem is checked before an expired one because both arrive as 422 and the
 * cause is ours, not the fare's.
 */
export interface MappedOrderError { code: string; message: string }

const EXPIRED_CODES = new Set([
    'offer_no_longer_available',
    'offer_expired',
    'offer_request_not_found',
    'not_found',
]);

export function mapDuffelOrderError(status: number, data: any): MappedOrderError {
    const first = data?.errors?.[0];
    const rawMessage: string = first?.message ?? '';
    const code: string = first?.code ?? '';

    const isPhone = /phone_number/i.test(rawMessage);
    const isBalance = code === 'insufficient_balance' || /insufficient.*balance|balance.*insufficient/i.test(rawMessage);
    const isExpired = !isBalance && (EXPIRED_CODES.has(code) || /expired|no longer available|select another offer/i.test(rawMessage));
    const isSeat = /seat|service.*unavailable|no longer.*available.*service/i.test(rawMessage) && !isExpired && !isBalance;

    if (isPhone) return { code: 'phone_number_invalid', message: 'The airline rejected the contact phone number.' };
    if (isBalance) return { code: 'balance_insufficient', message: 'Flight booking is temporarily unavailable. Please try again shortly.' };
    if (isExpired) return { code: 'flight_unavailable', message: 'This flight is no longer available.' };
    if (isSeat) return { code: 'seats_unavailable', message: 'The seats or bags you selected are no longer available.' };
    if (status >= 500) return { code: 'supplier_outage', message: 'The airline booking system is not responding right now.' };
    return { code: 'booking_failed', message: rawMessage || 'Flight booking failed. Please try again.' };
}
```

`src/lib/server/flights/duffel-order-passengers.ts` (lifted from `/api/flights/book`, "Build Duffel passenger objects" and `duffelTitle`):
```ts
import { duffelIdentityDocuments } from './duffel-identity-documents';

export type OrderPassengersResult =
    | { ok: true; passengers: any[] }
    | { ok: false; code: 'phone_number_invalid'; message: string };

/** Duffel accepts mr | ms | mrs | miss | dr. Children and infants are mr/miss by gender. */
function duffelTitle(pax: any): string {
    const gender = (pax.gender ?? '').toUpperCase();
    const type = (pax.type ?? '').toUpperCase();
    if (type === 'CHD' || type === 'INF') return gender === 'M' ? 'mr' : 'miss';
    return gender === 'M' ? 'mr' : 'ms';
}

/**
 * Duffel order passengers from the form data stored on a booking session.
 *
 * Passenger N on the order maps to passenger N on the offer — Duffel ties each traveller to
 * a specific offer passenger id. The phone is built E.164: the country code keeps digits only
 * ("+82", "82" and "0082" agree) and the number loses its trunk zero ("010-…" -> "10…").
 */
export function buildDuffelOrderPassengers(rawOffer: any, passengers: any[], contact: any): OrderPassengersResult {
    const countryCode = String(contact?.countryCode ?? '82').replace(/\D/g, '') || '82';
    const phone = String(contact?.phone ?? '').replace(/\D/g, '').replace(/^0+/, '');
    const e164 = `+${countryCode}${phone}`;

    if (phone.length < 4 || countryCode.length + phone.length < 7 || !/^\+\d{7,15}$/.test(e164)) {
        return {
            ok: false,
            code: 'phone_number_invalid',
            message: 'Invalid phone number. Please enter a valid phone number with country code.',
        };
    }

    const templates: any[] = rawOffer?.passengers ?? [];
    return {
        ok: true,
        passengers: passengers.map((pax: any, idx: number) => ({
            id: templates[idx]?.id,
            title: duffelTitle(pax),
            given_name: pax.firstName,
            family_name: pax.lastName,
            born_on: pax.birthDate,
            email: contact.email,
            phone_number: e164,
            gender: (pax.gender ?? '').toUpperCase() === 'M' ? 'm' : 'f',
            // Passport details for the airline's APIS feed — see duffelIdentityDocuments.
            ...duffelIdentityDocuments(rawOffer, pax),
        })),
    };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/server/flights/duffel-order-error.test.ts src/lib/server/flights/duffel-order-passengers.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/flights/duffel-order-error.ts src/lib/server/flights/duffel-order-error.test.ts src/lib/server/flights/duffel-order-passengers.ts src/lib/server/flights/duffel-order-passengers.test.ts
git commit -m "feat: extract Duffel order error mapping and order passenger building"
```

---

## Task 3: Quote helpers — order total, quote hash, capture decision

**Files:**
- Create: `src/lib/server/flights/flight-quote.ts`, `src/lib/server/flights/capture-decision.ts`
- Test: `src/lib/server/flights/flight-quote.test.ts`, `src/lib/server/flights/capture-decision.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/lib/server/flights/flight-quote.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { computeOrderTotal, quoteHash } from './flight-quote';

describe('computeOrderTotal', () => {
    const offer = {
        total_amount: '100.00',
        available_services: [
            { id: 'ase_seat', total_amount: '12.50' },
            { id: 'ase_bag', total_amount: '20.00' },
        ],
    };

    it('adds the offer own prices for the selected seats and bags', () => {
        expect(computeOrderTotal(offer, ['ase_seat'], ['ase_bag'])).toEqual({ total: '132.50', base: 100, seatExtra: 12.5, bagExtra: 20 });
    });

    it('ignores a service the offer does not list', () => {
        expect(computeOrderTotal(offer, ['ase_gone'], []).total).toBe('100.00');
    });
});

describe('quoteHash', () => {
    const base = {
        offerId: 'off_1',
        passengers: [{ firstName: 'Ana', lastName: 'Cruz', birthDate: '1990-02-03' }],
        seatServiceIds: ['s2', 's1'],
        bagServiceIds: [],
        chargeCurrency: 'USD',
        amountMinor: 10_700,
    };

    it('is stable across case, padding and service order', () => {
        const same = quoteHash({
            ...base,
            passengers: [{ firstName: '  ANA ', lastName: 'cruz', birthDate: '1990-02-03' }],
            seatServiceIds: ['s1', 's2'],
            chargeCurrency: 'usd',
        });
        expect(same).toBe(quoteHash(base));
    });

    it('is 32 hex characters', () => {
        expect(quoteHash(base)).toMatch(/^[0-9a-f]{32}$/);
    });

    it.each([
        ['a corrected name', { passengers: [{ firstName: 'Anna', lastName: 'Cruz', birthDate: '1990-02-03' }] }],
        ['a different date of birth', { passengers: [{ firstName: 'Ana', lastName: 'Cruz', birthDate: '1990-02-04' }] }],
        ['an added bag', { bagServiceIds: ['b1'] }],
        ['a different offer', { offerId: 'off_2' }],
        ['a different charge amount', { amountMinor: 10_800 }],
        ['a different charge currency', { chargeCurrency: 'PHP' }],
    ])('changes with %s', (_label, change) => {
        expect(quoteHash({ ...base, ...change })).not.toBe(quoteHash(base));
    });
});
```

`src/lib/server/flights/capture-decision.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { decideCapture } from './capture-decision';

// A simple markup so the arithmetic is checkable by eye: charged = base * 1.1
const chargedFor = (base: number) => Math.round(base * 1.1 * 100) / 100;
const input = { authorizedMinor: 11_000, quotedBase: 100, tolerance: 0.5, chargedFor };

describe('decideCapture', () => {
    it('captures the whole hold when the order cost what was quoted', () => {
        expect(decideCapture({ ...input, finalBase: 100 })).toEqual({ kind: 'capture', amountMinor: 11_000 });
    });

    it('absorbs a rise within tolerance', () => {
        expect(decideCapture({ ...input, finalBase: 100.4 })).toEqual({ kind: 'capture', amountMinor: 11_000 });
    });

    it('releases when the order cost more than tolerance allows', () => {
        expect(decideCapture({ ...input, finalBase: 101 })).toEqual({ kind: 'release', code: 'price_changed' });
    });

    it('captures proportionally less when the order was cheaper', () => {
        expect(decideCapture({ ...input, finalBase: 90 })).toEqual({ kind: 'capture', amountMinor: 9_900 });
    });

    it('never captures more than was authorised', () => {
        const d = decideCapture({ ...input, finalBase: 100, authorizedMinor: 5_000 });
        expect(d).toEqual({ kind: 'capture', amountMinor: 5_000 });
    });

    it('captures the hold when a price is unknown rather than guessing a smaller number', () => {
        expect(decideCapture({ ...input, finalBase: 0 })).toEqual({ kind: 'capture', amountMinor: 11_000 });
        expect(decideCapture({ ...input, quotedBase: 0, finalBase: 90 })).toEqual({ kind: 'capture', amountMinor: 11_000 });
    });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/server/flights/flight-quote.test.ts src/lib/server/flights/capture-decision.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`src/lib/server/flights/flight-quote.ts`:
```ts
import { createHash } from 'crypto';

/**
 * The amount to pay Duffel for an offer plus the selected ancillaries.
 *
 * Service prices always come from `available_services` on the offer itself, never from the
 * client's `seatTotal`/`bagTotal` — Duffel validates `payments.amount` against its own
 * arithmetic and rejects a mismatch.
 *
 * Copied from the same-named function in /api/flights/book/route.ts; the route's copy goes
 * when FLIGHT_PAY_FIRST is retired.
 */
export function computeOrderTotal(
    rawOffer: any,
    seatServiceIds: string[] | undefined,
    bagServiceIds: string[] | undefined,
    warn = false,
): { total: string; base: number; seatExtra: number; bagExtra: number } {
    const base = parseFloat(rawOffer?.total_amount ?? '0');
    const availableSvcs: any[] = rawOffer?.available_services ?? [];

    const sumFor = (ids: string[] | undefined, label: string) => {
        let sum = 0;
        for (const id of ids ?? []) {
            const svc = availableSvcs.find((s: any) => s.id === id);
            if (svc) sum += parseFloat(svc.total_amount ?? '0');
            else if (warn) console.warn(`[flight-quote] ${label} service ${id} not in available_services — excluding from order`);
        }
        return sum;
    };

    const seatExtra = sumFor(seatServiceIds, 'seat');
    const bagExtra = sumFor(bagServiceIds, 'bag');

    return { total: (base + seatExtra + bagExtra).toFixed(2), base, seatExtra, bagExtra };
}

export interface QuoteHashInput {
    offerId: string;
    passengers: Array<{ firstName?: string; lastName?: string; birthDate?: string }>;
    seatServiceIds?: string[];
    bagServiceIds?: string[];
    chargeCurrency: string;
    /** The PaymentIntent amount, so a re-quote at a different price is a different booking. */
    amountMinor: number;
}

/**
 * Identity of "this exact booking attempt".
 *
 * Two submits with the same hash are the same attempt and must share one session and one
 * PaymentIntent; a corrected name, an added bag or a moved price produces a new hash and so
 * a new attempt. Names are normalised so a stray space or capital does not split an attempt.
 */
export function quoteHash(input: QuoteHashInput): string {
    const norm = (s?: string) => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
    const canonical = JSON.stringify({
        o: input.offerId,
        p: (input.passengers ?? []).map(p => [norm(p.firstName), norm(p.lastName), (p.birthDate ?? '').trim()]),
        s: [...(input.seatServiceIds ?? [])].sort(),
        b: [...(input.bagServiceIds ?? [])].sort(),
        c: input.chargeCurrency.trim().toLowerCase(),
        a: input.amountMinor,
    });
    return createHash('sha256').update(canonical).digest('hex').slice(0, 32);
}
```

`src/lib/server/flights/capture-decision.ts`:
```ts
/**
 * After the card is authorised and the airline order exists: how much of the hold to capture.
 *
 * The hold was sized to the quote. Duffel's real total can differ by the time the order is
 * placed:
 *   cheaper                 -> capture the proportionally smaller charge (never the full hold)
 *   dearer, within tolerance -> absorb it; capture the quoted charge
 *   dearer, beyond tolerance -> release; the traveller must see the new price before paying it
 *
 * A hold cannot be raised after authorisation, so "dearer" can only ever be absorbed or refused.
 */
export interface CaptureInput {
    /** The authorised amount, in the currency's minor units. */
    authorizedMinor: number;
    /** What the quote was built from (supplier currency, incl. ancillaries). */
    quotedBase: number;
    /** What the airline order actually cost, same units as `quotedBase`. */
    finalBase: number;
    /** Absolute rise (supplier currency) treated as unchanged. */
    tolerance: number;
    /** Marked-up charge for a given base, in the supplier currency. */
    chargedFor: (base: number) => number;
}

export type CaptureDecision =
    | { kind: 'capture'; amountMinor: number }
    | { kind: 'release'; code: 'price_changed' };

export function decideCapture({ authorizedMinor, quotedBase, finalBase, tolerance, chargedFor }: CaptureInput): CaptureDecision {
    // A price we cannot read is not evidence of a discount. Capture what was authorised.
    if (!(quotedBase > 0) || !(finalBase > 0)) return { kind: 'capture', amountMinor: authorizedMinor };

    if (finalBase > quotedBase + tolerance) return { kind: 'release', code: 'price_changed' };
    if (finalBase >= quotedBase) return { kind: 'capture', amountMinor: authorizedMinor };

    const ratio = chargedFor(finalBase) / chargedFor(quotedBase);
    const scaled = Math.min(authorizedMinor, Math.round(authorizedMinor * ratio));
    return { kind: 'capture', amountMinor: Math.max(1, scaled) };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/server/flights/flight-quote.test.ts src/lib/server/flights/capture-decision.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/flights/flight-quote.ts src/lib/server/flights/flight-quote.test.ts src/lib/server/flights/capture-decision.ts src/lib/server/flights/capture-decision.test.ts
git commit -m "feat: quote hash, order total and capture decision helpers"
```

---

## Task 4: Flag, failure-reason and email-copy helpers

**Files:**
- Create: `src/lib/server/flights/pay-first-flag.ts`, `src/lib/server/flights/booking-failure.ts`, `src/lib/server/flights/booking-not-completed-copy.ts`
- Test: matching `*.test.ts` for each

- [ ] **Step 1: Write the failing tests**

`src/lib/server/flights/pay-first-flag.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { isPayFirstEnabled } from './pay-first-flag';

describe('isPayFirstEnabled', () => {
    it('is on only for the literal value "on"', () => {
        expect(isPayFirstEnabled({ FLIGHT_PAY_FIRST: 'on' })).toBe(true);
        expect(isPayFirstEnabled({ FLIGHT_PAY_FIRST: 'off' })).toBe(false);
        expect(isPayFirstEnabled({ FLIGHT_PAY_FIRST: 'true' })).toBe(false);
        expect(isPayFirstEnabled({})).toBe(false);
    });
});
```

`src/lib/server/flights/booking-failure.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { failureReasonOf, payFirstFailureEntry, NOT_COMPLETED_ERROR_CODE } from './booking-failure';

describe('booking failure reason', () => {
    it('round-trips through the cancellation_log shape', () => {
        const log = payFirstFailureEntry('price_changed', new Date('2026-10-28T10:00:00Z'));
        expect(log).toEqual([{ at: '2026-10-28T10:00:00.000Z', oldStatus: 'initiated', newStatus: 'failed', supplierResponse: { reason: 'price_changed' } }]);
        expect(failureReasonOf({ cancellation_log: log })).toBe('price_changed');
    });

    it('is null for a legacy failed row with no log', () => {
        expect(failureReasonOf({ cancellation_log: null })).toBeNull();
        expect(failureReasonOf({ cancellation_log: [] })).toBeNull();
        expect(failureReasonOf(null)).toBeNull();
        expect(failureReasonOf({ cancellation_log: [{ newStatus: 'failed' }] })).toBeNull();
    });

    it('exposes a stable client-facing code', () => {
        expect(NOT_COMPLETED_ERROR_CODE).toBe('booking_not_completed');
    });
});
```

`src/lib/server/flights/booking-not-completed-copy.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { notCompletedReasonCopy, segmentsForNotCompletedEmail } from './booking-not-completed-copy';

describe('notCompletedReasonCopy', () => {
    it.each([
        ['price_changed', /fare changed/i],
        ['flight_unavailable', /no longer available/i],
        ['seats_unavailable', /seats or bags/i],
        ['phone_number_invalid', /phone number/i],
        ['something_else', /could not confirm/i],
        [null, /could not confirm/i],
    ])('%s', (reason, pattern) => {
        expect(notCompletedReasonCopy(reason)).toMatch(pattern);
    });
});

describe('segmentsForNotCompletedEmail', () => {
    it('maps the session flight segments onto the email segment shape', () => {
        const out = segmentsForNotCompletedEmail({
            segments: [{
                airline: 'PR', airlineName: 'Philippine Airlines', flightNumber: 'PR300', origin: 'MNL', destination: 'HKG',
                departureTime: '2026-11-01T06:00:00', arrivalTime: '2026-11-01T08:30:00', cabinClass: 'economy', segmentIndex: 1,
            }],
        });
        expect(out).toEqual([{
            airline: 'PR', airlineName: 'Philippine Airlines', flightNumber: 'PR300', origin: 'MNL', destination: 'HKG',
            departureTime: '2026-11-01T06:00:00', arrivalTime: '2026-11-01T08:30:00', cabinClass: 'economy', itineraryIndex: 1,
        }]);
    });

    it('returns an empty list for a flight with no segments', () => {
        expect(segmentsForNotCompletedEmail({})).toEqual([]);
        expect(segmentsForNotCompletedEmail(null)).toEqual([]);
    });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/server/flights/pay-first-flag.test.ts src/lib/server/flights/booking-failure.test.ts src/lib/server/flights/booking-not-completed-copy.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`src/lib/server/flights/pay-first-flag.ts`:
```ts
/**
 * FLIGHT_PAY_FIRST=on switches the web /api/flights/book route to the pay-first flow
 * (docs/adr/0045-…). Anything else keeps the order-before-payment flow of ADR-0009, so a
 * rollback is an environment change, not a deploy.
 */
export function isPayFirstEnabled(env: Record<string, string | undefined> = process.env): boolean {
    return env.FLIGHT_PAY_FIRST === 'on';
}
```

`src/lib/server/flights/booking-failure.ts`:
```ts
/**
 * Why a pay-first booking failed, kept on the failed `flight_bookings` row.
 *
 * `flight_bookings` has no failure-reason column. `cancellation_log` is an append-only jsonb
 * list of state transitions shaped `{at, oldStatus, newStatus, supplierResponse}`; a failure
 * is one more transition, with the reason in `supplierResponse`. A row with no such entry is a
 * legacy failure, whose copy says the payment was refunded.
 */
export const NOT_COMPLETED_ERROR_CODE = 'booking_not_completed';
export const NOT_COMPLETED_MESSAGE = 'We could not complete your booking. Your card was not charged.';

export function payFirstFailureEntry(reason: string, now: Date = new Date()) {
    return [{
        at: now.toISOString(),
        oldStatus: 'initiated',
        newStatus: 'failed',
        supplierResponse: { reason },
    }];
}

export function failureReasonOf(row: { cancellation_log?: unknown } | null | undefined): string | null {
    const log = row?.cancellation_log;
    if (!Array.isArray(log)) return null;
    for (const entry of log) {
        const reason = (entry as any)?.supplierResponse?.reason;
        if (typeof reason === 'string' && reason) return reason;
    }
    return null;
}

/** The JSON a route answers for a failed booking, by session. Pay-first failures say "not charged". */
export async function failedBookingResponse(db: any, sessionId: string) {
    const { data } = await db
        .from('flight_bookings')
        .select('cancellation_log')
        .eq('session_id', sessionId)
        .maybeSingle();
    const reason = failureReasonOf(data);
    if (reason) {
        return { success: false, errorCode: NOT_COMPLETED_ERROR_CODE, reason, error: NOT_COMPLETED_MESSAGE };
    }
    return {
        success: false,
        errorCode: 'booking_failed_refunded',
        error: 'Booking failed — the flight offer was no longer available. Your payment has been automatically refunded.',
    };
}
```

`src/lib/server/flights/booking-not-completed-copy.ts`:
```ts
/** Pure helpers for the "we couldn't complete your booking" email. No I/O. */

export function notCompletedReasonCopy(reason: string | null | undefined): string {
    switch (reason) {
        case 'price_changed':
            return 'The fare changed while we were confirming it with the airline.';
        case 'flight_unavailable':
            return 'This flight is no longer available.';
        case 'seats_unavailable':
            return 'The seats or bags you selected are no longer available.';
        case 'phone_number_invalid':
            return 'The airline rejected the contact phone number.';
        default:
            return 'The airline could not confirm the booking.';
    }
}

export interface NotCompletedSegment {
    airline: string;
    airlineName?: string;
    flightNumber: string;
    origin: string;
    destination: string;
    departureTime: string;
    arrivalTime: string;
    itineraryIndex?: number;
    cabinClass?: string;
}

/** The session stores the client's normalised segments; the email wants this subset. */
export function segmentsForNotCompletedEmail(flight: any): NotCompletedSegment[] {
    const segments: any[] = Array.isArray(flight?.segments) ? flight.segments : [];
    return segments.map(s => ({
        airline: s.airline,
        airlineName: s.airlineName,
        flightNumber: s.flightNumber,
        origin: s.origin,
        destination: s.destination,
        departureTime: s.departureTime,
        arrivalTime: s.arrivalTime,
        cabinClass: s.cabinClass,
        itineraryIndex: s.segmentIndex ?? s.itineraryIndex,
    }));
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/server/flights/pay-first-flag.test.ts src/lib/server/flights/booking-failure.test.ts src/lib/server/flights/booking-not-completed-copy.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/flights/pay-first-flag.ts src/lib/server/flights/pay-first-flag.test.ts src/lib/server/flights/booking-failure.ts src/lib/server/flights/booking-failure.test.ts src/lib/server/flights/booking-not-completed-copy.ts src/lib/server/flights/booking-not-completed-copy.test.ts
git commit -m "feat: pay-first flag, failure-reason helpers and failure-email copy"
```

---

## Task 5: Migration — `quote_hash` and the email type

**Files:**
- Create: `db/migrations/20261028000001_pay_first_flight_booking.sql`
- Maybe modify: `db/schema.sql` (Step 4)

- [ ] **Step 1: Write the migration**

```sql
-- Pay-first flight booking (docs/superpowers/specs/2026-10-28-pay-first-flight-booking-design.md)

-- 1. A booking attempt's identity. NULL for every session created before this migration.
ALTER TABLE public.booking_sessions ADD COLUMN IF NOT EXISTS quote_hash text;

-- One live attempt per traveller per exact quote. Two submits of the same trip (a double click,
-- or a back-click and resubmit) collide here instead of creating two sessions. 'processing' is
-- included so a booking that is mid-flight cannot be started a second time.
CREATE UNIQUE INDEX IF NOT EXISTS booking_sessions_active_quote_uniq
    ON public.booking_sessions (user_id, quote_hash)
    WHERE quote_hash IS NOT NULL
      AND status IN ('initiated', 'payment_initiated', 'payment_authorized', 'processing');

-- 2. The "we couldn't complete your booking" email.
ALTER TABLE public.email_logs DROP CONSTRAINT IF EXISTS email_logs_email_type_check;
ALTER TABLE public.email_logs ADD CONSTRAINT email_logs_email_type_check CHECK (email_type = ANY (ARRAY[
    'confirmation', 'ticketed', 'refund', 'cancellation', 'awaiting_ticket', 'price_alert',
    'support_escalation', 'golf_requested', 'golf_confirmed', 'golf_declined', 'golf_cancelled',
    'golf_course_invitation', 'golf_course_request_approved', 'golf_course_request_rejected',
    'golf_course_new_request', 'booking_not_completed'
]));
```

- [ ] **Step 2: Apply it to the local database**

Run: `docker exec -i cheapest-go-app-postgres-1 psql -U cheapestgo -d cheapestgo -X -v ON_ERROR_STOP=1 < db/migrations/20261028000001_pay_first_flight_booking.sql`
Expected: `ALTER TABLE`, `CREATE INDEX`, `ALTER TABLE`, `ALTER TABLE` with no errors.

- [ ] **Step 3: Verify**

Run:
```bash
docker exec -i cheapest-go-app-postgres-1 psql -U cheapestgo -d cheapestgo -X -At -c "SELECT column_name FROM information_schema.columns WHERE table_name='booking_sessions' AND column_name='quote_hash'; SELECT indexname FROM pg_indexes WHERE indexname='booking_sessions_active_quote_uniq'; SELECT pg_get_constraintdef(oid) LIKE '%booking_not_completed%' FROM pg_constraint WHERE conname='email_logs_email_type_check';"
```
Expected: `quote_hash`, `booking_sessions_active_quote_uniq`, `t`.

- [ ] **Step 4: Keep `db/schema.sql` in step if it is maintained**

Run: `git log --oneline -5 -- db/schema.sql` and `git log --oneline -5 -- db/migrations`
If `schema.sql` is updated alongside migrations, add the same three changes by hand (the `quote_hash text` column inside `CREATE TABLE public.booking_sessions`, the new `CREATE UNIQUE INDEX`, and the extended CHECK on `email_logs`). If it is not, leave it and say so in the commit message.

- [ ] **Step 5: Commit**

```bash
git add db/migrations/20261028000001_pay_first_flight_booking.sql db/schema.sql
git commit -m "feat: booking_sessions.quote_hash and booking_not_completed email type"
```

> **Rollout note (not a task step):** staging and production need this migration applied before the flag is turned on. No runner exists in the repo; confirm with the owner how `db/migrations/*.sql` reach those databases.

---

## Task 6: Pay-first payment creation and the `/book` branch

**Files:**
- Create: `src/lib/server/flights/pay-first-payment.ts`, `src/lib/server/flights/pay-first-deps.ts`
- Modify: `src/app/api/flights/book/route.ts` (imports near line 38; branch before the session insert near line 632)
- Test: `src/lib/server/flights/pay-first-payment.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/lib/server/flights/pay-first-payment.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { applyMarkup, toStripeAmount, FLIGHT_MARKUP_SPEC } from '@/lib/pricing';
import {
    createPayFirstPayment,
    type PayFirstInput,
    type PayFirstDeps,
    type SessionRow,
    type StoredSession,
    type IntentSummary,
} from './pay-first-payment';

// ── Fakes ────────────────────────────────────────────────────────────────────

class FakeStore {
    sessions = new Map<string, { id: string; row: SessionRow; paymentIntentId: string | null; status: string }>();
    private n = 0;
    async getOrCreate(row: SessionRow): Promise<StoredSession> {
        const key = `${row.user_id}|${row.quote_hash}`;
        const live = [...this.sessions.values()].find(s => `${s.row.user_id}|${s.row.quote_hash}` === key && s.status !== 'expired');
        if (live) return { sessionId: live.id, created: false, paymentIntentId: live.paymentIntentId, bookingReference: live.row.booking_reference };
        const id = `sess_${++this.n}`;
        this.sessions.set(id, { id, row, paymentIntentId: null, status: 'initiated' });
        return { sessionId: id, created: true, paymentIntentId: null, bookingReference: row.booking_reference };
    }
    async attachPayment(sessionId: string, fields: { payment_intent_id: string }) {
        const s = this.sessions.get(sessionId)!;
        s.paymentIntentId = fields.payment_intent_id;
        s.status = 'payment_initiated';
    }
    async supersedeOthers(userId: string, offerId: string, keep: string) {
        const out: string[] = [];
        for (const s of this.sessions.values()) {
            const sameOffer = (s.row.flight as any)?._rawOffer?.id === offerId;
            if (s.id !== keep && s.row.user_id === userId && sameOffer && s.status !== 'expired') {
                s.status = 'expired';
                if (s.paymentIntentId) out.push(s.paymentIntentId);
            }
        }
        return out;
    }
}

class FakeGateway {
    intents = new Map<string, IntentSummary & { params: any }>();
    byKey = new Map<string, string>();
    createCalls: Array<{ params: any; key: string }> = [];
    cancelled: string[] = [];
    async createIntent(params: any, key: string): Promise<IntentSummary> {
        this.createCalls.push({ params, key });
        const existing = this.byKey.get(key);
        if (existing) return this.intents.get(existing)!;
        const id = `pi_${this.intents.size + 1}`;
        const intent = { id, status: 'requires_payment_method', client_secret: `${id}_secret`, params };
        this.intents.set(id, intent);
        this.byKey.set(key, id);
        return intent;
    }
    async retrieveIntent(id: string) { return this.intents.get(id)!; }
    async cancelIntent(id: string) { this.cancelled.push(id); this.intents.get(id)!.status = 'canceled'; }
}

const rawOffer = { id: 'off_1', total_amount: '100.00', total_currency: 'USD', passengers: [{ id: 'pas_1' }], available_services: [{ id: 'ase_bag', total_amount: '20.00' }] };

function makeInput(over: Partial<PayFirstInput> = {}): PayFirstInput {
    const flight = { price: 100, currency: 'USD', segments: [{ origin: 'MNL', destination: 'HKG' }], _rawOffer: rawOffer };
    return {
        userId: 'user_1', flight, sanitizedFlight: { ...flight },
        passengers: [{ firstName: 'Ana', lastName: 'Cruz', birthDate: '1990-02-03', gender: 'F', type: 'ADT' }],
        contact: { email: 'ana@example.com', phone: '9171234567', countryCode: '63' },
        displayCurrency: 'USD', settlementCurrency: 'usd',
        serverFarePolicy: null, bookingReference: 'CG-REF-1', brand: 'cheapestgo',
        expiresAt: '2026-10-28T12:00:00.000Z', duffelToken: 'duffel_test_x',
        ...over,
    };
}

function makeDeps(over: Partial<PayFirstDeps> = {}) {
    const store = new FakeStore();
    const gateway = new FakeGateway();
    const deps: PayFirstDeps = {
        withServicePrices: async (offer: any) => offer,
        convert: (amount: number) => amount, // same-currency: identity
        store, gateway,
        ...over,
    };
    return { deps, store, gateway };
}

const expectedMinor = (base: number) => toStripeAmount(applyMarkup(base, FLIGHT_MARKUP_SPEC, FLIGHT_MARKUP_SPEC.flat).chargedPrice, 'usd');

// ── Tests ────────────────────────────────────────────────────────────────────

describe('createPayFirstPayment', () => {
    it('creates one manual-capture intent for the marked-up quote and buys nothing', async () => {
        const { deps, gateway } = makeDeps();
        const res = await createPayFirstPayment(makeInput(), deps);

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ success: true, sessionId: 'sess_1', paymentIntentId: 'pi_1', clientSecret: 'pi_1_secret' });
        const { params } = gateway.createCalls[0];
        expect(params.capture_method).toBe('manual');
        expect(params.amount).toBe(expectedMinor(100));
        expect(params.metadata).toMatchObject({ payFirst: 'true', provider: 'duffel', bookingSessionId: 'sess_1', quotedTotal: '100.00', baseCurrency: 'usd' });
        expect(params.metadata.duffelOrderId).toBeUndefined();
    });

    it('prices selected extras from the offer own services', async () => {
        const { deps, gateway } = makeDeps();
        await createPayFirstPayment(makeInput({ bagServiceIds: ['ase_bag'] }), deps);
        expect(gateway.createCalls[0].params.amount).toBe(expectedMinor(120));
        expect(gateway.createCalls[0].params.metadata.quotedTotal).toBe('120.00');
    });

    it('adopts a lower live fare from revalidation but never a higher one', async () => {
        const lower = makeDeps();
        await createPayFirstPayment(makeInput({ liveBaseTotal: 90 }), lower.deps);
        expect(lower.gateway.createCalls[0].params.metadata.quotedTotal).toBe('90.00');

        const higher = makeDeps();
        await createPayFirstPayment(makeInput({ liveBaseTotal: 130 }), higher.deps);
        expect(higher.gateway.createCalls[0].params.metadata.quotedTotal).toBe('100.00');
    });

    // The original bug: click confirm, press back while it submits, submit again.
    it('REGRESSION: a repeat submit of the same trip shares one session and one PaymentIntent', async () => {
        const { deps, store, gateway } = makeDeps();
        const first = await createPayFirstPayment(makeInput(), deps);
        const second = await createPayFirstPayment(makeInput(), deps);

        expect(second.status).toBe(200);
        expect(second.body.sessionId).toBe(first.body.sessionId);
        expect(second.body.paymentIntentId).toBe(first.body.paymentIntentId);
        expect(store.sessions.size).toBe(1);
        expect(gateway.createCalls).toHaveLength(1);
    });

    it('a corrected name is a new attempt: the old session is expired and its hold cancelled', async () => {
        const { deps, store, gateway } = makeDeps();
        const first = await createPayFirstPayment(makeInput(), deps);
        const corrected = await createPayFirstPayment(makeInput({
            passengers: [{ firstName: 'Anna', lastName: 'Cruz', birthDate: '1990-02-03', gender: 'F', type: 'ADT' }],
        }), deps);

        expect(corrected.body.sessionId).not.toBe(first.body.sessionId);
        expect(store.sessions.get(first.body.sessionId as string)!.status).toBe('expired');
        expect(gateway.cancelled).toEqual([first.body.paymentIntentId]);
    });

    it('answers booking_pending instead of creating anything once the card is already authorised', async () => {
        const { deps, gateway } = makeDeps();
        const first = await createPayFirstPayment(makeInput(), deps);
        gateway.intents.get(first.body.paymentIntentId as string)!.status = 'requires_capture';

        const again = await createPayFirstPayment(makeInput(), deps);
        expect(again.status).toBe(409);
        expect(again.body).toMatchObject({ success: false, errorCode: 'booking_pending' });
        expect(gateway.createCalls).toHaveLength(1);
    });

    it('refuses before creating a session when the charge currency cannot be converted', async () => {
        const { deps, store, gateway } = makeDeps({
            convert: (amount: number, from: string, to: string) => {
                if (from.toLowerCase() === to.toLowerCase()) return amount;
                throw new Error('no rate');
            },
        });
        const res = await createPayFirstPayment(makeInput({ displayCurrency: 'PHP' }), deps);
        expect(res.status).toBe(503);
        expect(res.body).toMatchObject({ code: 'FX_UNAVAILABLE' });
        expect(store.sessions.size).toBe(0);
        expect(gateway.createCalls).toHaveLength(0);
    });

    it('cancels the hold and says the card was not charged if the session cannot be saved', async () => {
        const { deps, store, gateway } = makeDeps();
        store.attachPayment = async () => { throw new Error('db down'); };
        const res = await createPayFirstPayment(makeInput(), deps);
        expect(res.status).toBe(500);
        expect(String(res.body.error)).toMatch(/not charged/i);
        expect(gateway.cancelled).toEqual(['pi_1']);
    });

    it('rejects an offer with no Duffel id', async () => {
        const { deps } = makeDeps();
        const res = await createPayFirstPayment(makeInput({ flight: { segments: [] } }), deps);
        expect(res.status).toBe(400);
    });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/server/flights/pay-first-payment.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `pay-first-payment.ts`**

```ts
import { applyMarkup, toStripeAmount, FLIGHT_MARKUP_SPEC } from '@/lib/pricing';
import { computeOrderTotal, quoteHash } from './flight-quote';
import type { withDuffelServicePrices } from './duffel-service-prices';

/**
 * Pay-first: the traveller has submitted the booking form. Quote the trip, make sure there is
 * exactly one live attempt for it, and hand back a PaymentIntent that only HOLDS the card.
 * Nothing is bought from the airline here — that happens after authorisation (see
 * settle-authorized-flight.ts), so a submit that is repeated, abandoned or raced costs nothing.
 */

export interface PayFirstInput {
    userId: string;
    /** The client payload; `flight._rawOffer` is the raw Duffel offer. */
    flight: any;
    /** Shallow copy of `flight` stored on the session (keeps `_rawOffer` for the later order). */
    sanitizedFlight: any;
    passengers: any[];
    contact: { email: string; [k: string]: any };
    seatServiceIds?: string[];
    bagServiceIds?: string[];
    displayCurrency?: string;
    /** The supplier's currency, lowercase. */
    settlementCurrency: string;
    /** Revalidation's live fare, used only when it is LOWER than the offer's. */
    liveBaseTotal?: number;
    serverFarePolicy: any;
    bookingReference: string;
    brand: string;
    bundleHotelId?: string;
    expiresAt: string;
    duffelToken: string;
}

export interface PayFirstResponse { status: number; body: Record<string, unknown> }

export interface SessionRow {
    user_id: string;
    provider: 'duffel';
    booking_reference: string;
    flight: unknown;
    passengers: unknown;
    contact: unknown;
    idempotency_key: string;
    quote_hash: string;
    fare_policy: unknown;
    policy_source: string | null;
    policy_version: string | null;
    is_refundable: boolean | null;
    is_changeable: boolean | null;
    refund_penalty_amount: number | null;
    refund_penalty_currency: string | null;
    policy_locked: true;
    status: 'initiated';
    expires_at: string;
    seat_service_ids?: string[];
    seat_total?: number;
    bag_service_ids?: string[];
    bag_total?: number;
}

export interface StoredSession {
    sessionId: string;
    /** False when an identical live attempt already existed. */
    created: boolean;
    paymentIntentId: string | null;
    /** Always the stored session's own reference, so a retry sends Stripe identical parameters. */
    bookingReference: string;
}

export interface PaymentFields {
    payment_intent_id: string;
    currency: string;
    original_price: number;
    charged_price: number;
    markup_pct: number;
    payment_currency: string;
}

export interface SessionStore {
    getOrCreate(row: SessionRow): Promise<StoredSession>;
    attachPayment(sessionId: string, fields: PaymentFields): Promise<void>;
    /** Expire OTHER unpaid, order-less sessions for this offer; returns their PaymentIntent ids. */
    supersedeOthers(userId: string, offerId: string, keepSessionId: string): Promise<string[]>;
}

export interface IntentSummary { id: string; status: string; client_secret: string | null }

export interface PaymentGateway {
    createIntent(params: Record<string, unknown>, idempotencyKey: string): Promise<IntentSummary>;
    retrieveIntent(id: string): Promise<IntentSummary>;
    cancelIntent(id: string): Promise<void>;
}

export interface PayFirstDeps {
    withServicePrices: typeof withDuffelServicePrices;
    /** Strict currency conversion; throws when a rate is unavailable. */
    convert: (amount: number, from: string, to: string) => number;
    store: SessionStore;
    gateway: PaymentGateway;
}

/** PaymentIntent states in which the traveller can still enter or confirm a card. */
const AWAITING_CARD = new Set(['requires_payment_method', 'requires_confirmation', 'requires_action']);

const round2 = (n: number) => Math.round(n * 100) / 100;
const fail = (status: number, body: Record<string, unknown>): PayFirstResponse => ({ status, body: { success: false, ...body } });

export async function createPayFirstPayment(input: PayFirstInput, deps: PayFirstDeps): Promise<PayFirstResponse> {
    const rawOffer = input.flight?._rawOffer;
    if (!rawOffer?.id) return fail(400, { error: 'Duffel offer data missing — cannot book.' });

    const seatIds = input.seatServiceIds ?? [];
    const bagIds = input.bagServiceIds ?? [];

    // The offer posted here is a search result and never carries services, so extras would
    // price at zero. Ask Duffel for the selected ones.
    let priced: any;
    try {
        priced = await deps.withServicePrices(rawOffer, seatIds, bagIds, input.duffelToken);
    } catch (err: any) {
        return fail(502, { error: err?.message ?? 'Could not price the selected extras.' });
    }

    // ── Quote ────────────────────────────────────────────────────────────────
    const { base, seatExtra, bagExtra } = computeOrderTotal(priced, seatIds, bagIds, true);
    // A fare that has dropped is adopted (else we would charge the old price while Duffel bills
    // the lower one). A rise never gets here: /book's revalidation gate already refused it.
    const baseFare = input.liveBaseTotal !== undefined && input.liveBaseTotal > 0 && input.liveBaseTotal < base
        ? input.liveBaseTotal
        : base;
    const quotedTotal = round2(baseFare + seatExtra + bagExtra);
    const baseCurrency = String(priced.total_currency || input.settlementCurrency).toLowerCase();

    // The markup's flat part is USD (Duffel's order fee and Stripe's $0.30), so it is converted
    // into the supplier currency first. Dropped, not thrown, if that fails: failing a sale over
    // a few cents is the wrong trade.
    let flat = FLIGHT_MARKUP_SPEC.flat;
    try {
        flat = deps.convert(FLIGHT_MARKUP_SPEC.flat, 'usd', baseCurrency);
    } catch (err: any) {
        flat = 0;
        console.error(`[pay-first] Could not convert the flat markup USD→${baseCurrency} (${err?.message}) — charging the proportional part only.`);
    }
    const pricing = applyMarkup(quotedTotal, FLIGHT_MARKUP_SPEC, flat);

    const chargeCurrency = String(input.displayCurrency || input.settlementCurrency).toLowerCase();
    let chargePrice: number;
    try {
        chargePrice = chargeCurrency !== baseCurrency
            ? round2(deps.convert(pricing.chargedPrice, baseCurrency, chargeCurrency.toUpperCase()))
            : pricing.chargedPrice;
    } catch (err: any) {
        console.error(`[pay-first] FX conversion failed (${baseCurrency}→${chargeCurrency}):`, err?.message);
        // Nothing has been created yet, so there is nothing to undo.
        return fail(503, {
            error: 'Currency conversion is temporarily unavailable. Please try again shortly.',
            code: 'FX_UNAVAILABLE',
        });
    }
    const amountMinor = toStripeAmount(chargePrice, chargeCurrency);

    // ── One live attempt per exact quote ─────────────────────────────────────
    const hash = quoteHash({
        offerId: rawOffer.id,
        passengers: input.passengers,
        seatServiceIds: seatIds,
        bagServiceIds: bagIds,
        chargeCurrency,
        amountMinor,
    });

    const policy = input.serverFarePolicy as any;
    const row: SessionRow = {
        user_id: input.userId,
        provider: 'duffel',
        booking_reference: input.bookingReference,
        flight: input.sanitizedFlight,
        passengers: input.passengers,
        contact: input.contact,
        idempotency_key: hash,
        quote_hash: hash,
        fare_policy: policy ?? null,
        policy_source: policy?.policySource ?? null,
        policy_version: policy?.policyVersion ?? null,
        is_refundable: policy?.isRefundable ?? null,
        is_changeable: policy?.isChangeable ?? null,
        refund_penalty_amount: policy?.refundPenaltyAmount ?? null,
        refund_penalty_currency: policy?.refundPenaltyCurrency ?? null,
        policy_locked: true,
        status: 'initiated',
        expires_at: input.expiresAt,
        ...(seatIds.length ? { seat_service_ids: seatIds, seat_total: seatExtra } : {}),
        ...(bagIds.length ? { bag_service_ids: bagIds, bag_total: bagExtra } : {}),
    };

    let stored: StoredSession;
    try {
        stored = await deps.store.getOrCreate(row);
    } catch (err: any) {
        console.error('[pay-first] could not create a booking session:', err?.message ?? err);
        return fail(500, { error: 'A session error occurred. Your card was not charged. Please try again.' });
    }

    // ── The PaymentIntent ────────────────────────────────────────────────────
    let intent: IntentSummary;
    let attach = true;
    try {
        if (stored.paymentIntentId) {
            // A repeat submit. Reuse the hold if the traveller can still pay it; once the card
            // is authorised the booking is in progress and must not be started again.
            intent = await deps.gateway.retrieveIntent(stored.paymentIntentId);
            attach = false;
            if (!AWAITING_CARD.has(intent.status)) {
                return fail(409, {
                    errorCode: 'booking_pending',
                    error: 'Your payment is already being processed. We will email you when the booking is confirmed.',
                });
            }
        } else {
            const first = input.flight?.segments?.[0];
            const last = input.flight?.segments?.[input.flight.segments.length - 1];
            intent = await deps.gateway.createIntent({
                amount: amountMinor,
                currency: chargeCurrency,
                // Hold the card; take the money only once the airline order exists.
                capture_method: 'manual',
                metadata: {
                    bookingReference: stored.bookingReference,
                    brand: input.brand,
                    bookingSessionId: stored.sessionId,
                    provider: 'duffel',
                    userId: input.userId,
                    passengerEmail: input.contact.email,
                    originalPrice: String(pricing.originalPrice),
                    markupRate: String(pricing.markupRate),
                    markupAmount: String(pricing.markupAmount),
                    // What the post-authorisation step needs to place the order and size the capture.
                    payFirst: 'true',
                    quotedTotal: quotedTotal.toFixed(2),
                    baseCurrency,
                    flatInBase: String(flat),
                    ...(input.bundleHotelId ? { bundleHotelId: input.bundleHotelId, type: 'flight_bundle' } : { type: 'flight' }),
                },
                description: `${stored.bookingReference} · ${first?.origin ?? ''} → ${last?.destination ?? ''}`,
            }, `flight-pi-${input.userId}-${hash}`);
        }
    } catch (err: any) {
        console.error('[pay-first] could not create the PaymentIntent:', err?.message ?? err);
        return fail(502, { error: 'Payment could not be started. Your card was not charged. Please try again.' });
    }

    if (attach) {
        try {
            await deps.store.attachPayment(stored.sessionId, {
                payment_intent_id: intent.id,
                currency: baseCurrency,
                original_price: pricing.originalPrice,
                charged_price: chargePrice,
                markup_pct: pricing.markupRate,
                payment_currency: chargeCurrency.toUpperCase(),
            });
        } catch (err: any) {
            console.error('[pay-first] could not save the PaymentIntent on the session:', err?.message ?? err);
            await deps.gateway.cancelIntent(intent.id).catch(() => {});
            return fail(500, { error: 'A session error occurred. Your card was not charged. Please try again.' });
        }
    }

    // A changed detail (a corrected name, a different bag) makes the earlier unpaid attempt
    // unpayable. Retire it and release its hold so it does not linger as an unexplained
    // Incomplete in Stripe.
    try {
        const stale = await deps.store.supersedeOthers(input.userId, rawOffer.id, stored.sessionId);
        for (const piId of stale) await deps.gateway.cancelIntent(piId).catch(() => {});
    } catch (err: any) {
        console.warn('[pay-first] could not retire superseded sessions:', err?.message ?? err);
    }

    return { status: 200, body: { success: true, clientSecret: intent.client_secret, sessionId: stored.sessionId, paymentIntentId: intent.id } };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/server/flights/pay-first-payment.test.ts`
Expected: 9 tests PASS. If the FX test fails because `convert` is called with `'usd'→'usd'` for the flat component, the fake already returns the amount for equal currencies — re-read the fake before changing production code.

- [ ] **Step 5: Add the real wiring `src/lib/server/flights/pay-first-deps.ts`**

```ts
import { createAdminClient } from '@/utils/postgres/admin';
import { getSqlAdmin } from '@/lib/db/postgres';
import { stripe } from '@/lib/stripe/server';
import { convertCurrencyStrict } from '@/lib/currency';
import { withDuffelServicePrices } from './duffel-service-prices';
import type { PayFirstDeps, SessionStore, PaymentGateway } from './pay-first-payment';

/** Statuses in which a session still represents a live attempt (matches the unique index). */
const LIVE = ['initiated', 'payment_initiated', 'payment_authorized', 'processing'];

function sessionStore(): SessionStore {
    const db = createAdminClient();
    return {
        async getOrCreate(row) {
            const { data, error } = await db
                .from('booking_sessions')
                .insert(row as any)
                .select('id, payment_intent_id, booking_reference')
                .single();
            if (!error && data) {
                return { sessionId: data.id, created: true, paymentIntentId: data.payment_intent_id ?? null, bookingReference: data.booking_reference };
            }
            // 23505 = the partial unique index: an identical live attempt exists. Use it.
            if (error?.code !== '23505') throw new Error(error?.message || 'Failed to create booking session');

            const { data: existing, error: findError } = await db
                .from('booking_sessions')
                .select('id, payment_intent_id, booking_reference')
                .eq('user_id', row.user_id)
                .eq('quote_hash', row.quote_hash)
                .in('status', LIVE)
                .single();
            if (findError || !existing) throw new Error(findError?.message || 'Booking session conflict could not be resolved');
            return { sessionId: existing.id, created: false, paymentIntentId: existing.payment_intent_id ?? null, bookingReference: existing.booking_reference };
        },

        async attachPayment(sessionId, fields) {
            const { error } = await db
                .from('booking_sessions')
                .update({ ...fields, status: 'payment_initiated' })
                .eq('id', sessionId);
            if (error) throw new Error(error.message);
        },

        async supersedeOthers(userId, offerId, keepSessionId) {
            const sql = getSqlAdmin();
            // Only sessions that hold no airline order: an order-bearing session belongs to the
            // old flow (or a live booking) and must not be touched from here.
            const rows = await sql`
                UPDATE booking_sessions
                SET status = 'expired'
                WHERE user_id = ${userId}
                  AND id <> ${keepSessionId}
                  AND status IN ('initiated', 'payment_initiated')
                  AND duffel_pre_order_id IS NULL
                  AND flight->'_rawOffer'->>'id' = ${offerId}
                RETURNING payment_intent_id
            `;
            return rows.map((r: any) => r.payment_intent_id).filter(Boolean) as string[];
        },
    };
}

function paymentGateway(): PaymentGateway {
    const summary = (pi: { id: string; status: string; client_secret: string | null }) => ({
        id: pi.id, status: pi.status, client_secret: pi.client_secret,
    });
    return {
        async createIntent(params, idempotencyKey) {
            return summary(await stripe.paymentIntents.create(params as any, { idempotencyKey }));
        },
        async retrieveIntent(id) {
            return summary(await stripe.paymentIntents.retrieve(id));
        },
        async cancelIntent(id) {
            await stripe.paymentIntents.cancel(id);
        },
    };
}

export function defaultPayFirstDeps(): PayFirstDeps {
    return {
        withServicePrices: withDuffelServicePrices,
        convert: convertCurrencyStrict,
        store: sessionStore(),
        gateway: paymentGateway(),
    };
}
```

- [ ] **Step 6: Add the flagged branch to `/api/flights/book`**

In `src/app/api/flights/book/route.ts`:

1. After `import { canonicalBrandName } from '@/lib/brand';` add:
```ts
import { isPayFirstEnabled } from '@/lib/server/flights/pay-first-flag';
import { createPayFirstPayment } from '@/lib/server/flights/pay-first-payment';
import { defaultPayFirstDeps } from '@/lib/server/flights/pay-first-deps';
```

2. Replace
```ts
        const bookingReference = mintBookingReference(brand);

        const { data: sessionRow, error: sessionError } = await db
```
with
```ts
        const bookingReference = mintBookingReference(brand);

        // ── Pay-first (FLIGHT_PAY_FIRST=on): hold the card now, buy the airline order after ──
        // Everything above (auth, validation, FX guard, duplicate-day warning, revalidation and
        // its price gate) has already run. See docs/adr/0045-… . Off, the order-before-payment
        // flow below is unchanged.
        if (provider === 'duffel' && isPayFirstEnabled()) {
            const payFirst = await createPayFirstPayment({
                userId,
                flight: flight as any,
                sanitizedFlight,
                passengers,
                contact: contact as any,
                seatServiceIds,
                bagServiceIds,
                displayCurrency,
                settlementCurrency,
                liveBaseTotal: revalNewPrice > 0 ? revalNewPrice : undefined,
                serverFarePolicy,
                bookingReference,
                brand,
                bundleHotelId,
                expiresAt,
                duffelToken: env.DUFFEL_TOKEN,
            }, defaultPayFirstDeps());
            return NextResponse.json(payFirst.body, { status: payFirst.status });
        }

        const { data: sessionRow, error: sessionError } = await db
```

- [ ] **Step 7: Type-check and run the file's neighbours**

Run: `npx tsc --noEmit -p . 2>&1 | grep -E "pay-first|flights/book/route" | head`
Expected: no output (no type errors in the touched files). Then `npx vitest run src/lib/server/flights`. Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/server/flights/pay-first-payment.ts src/lib/server/flights/pay-first-payment.test.ts src/lib/server/flights/pay-first-deps.ts src/app/api/flights/book/route.ts
git commit -m "feat: pay-first payment creation behind FLIGHT_PAY_FIRST"
```

---

## Task 7: Settle an authorised flight — place the order, then capture or release

**Files:**
- Create: `src/lib/server/flights/settle-authorized-flight.ts`, `src/lib/server/flights/settle-deps.ts`
- Test: `src/lib/server/flights/settle-authorized-flight.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect, vi } from 'vitest';
import { settleAuthorizedFlight, type SettleDeps, type SettleInput } from './settle-authorized-flight';

const rawOffer = { id: 'off_1', total_amount: '100.00', total_currency: 'USD', passengers: [{ id: 'pas_1' }], available_services: [] };

const session = {
    id: 'sess_1',
    flight: { _rawOffer: rawOffer, segments: [] },
    passengers: [{ firstName: 'Ana', lastName: 'Cruz', birthDate: '1990-02-03', gender: 'F', type: 'ADT' }],
    contact: { email: 'ana@example.com', phone: '9171234567', countryCode: '63' },
    seat_service_ids: null,
    bag_service_ids: null,
};
const input: SettleInput = { session, paymentIntentId: 'pi_1', duffelToken: 'duffel_test_x', priceTolerance: 0.5 };

const payFirstIntent = (over: Record<string, unknown> = {}) => ({
    id: 'pi_1', status: 'requires_capture', amount: 11_000, currency: 'usd',
    metadata: { payFirst: 'true', quotedTotal: '100.00', baseCurrency: 'usd', flatInBase: '0' },
    ...over,
});

const rawOrder = {
    id: 'ord_1', booking_reference: 'ABC123', total_amount: '100.00', total_currency: 'USD',
    documents: [{ type: 'electronic_ticket', unique_identifier: 'T1' }], slices: [],
};

function makeDeps(over: Partial<SettleDeps> = {}) {
    const calls: string[] = [];
    const deps: SettleDeps = {
        retrievePaymentIntent: vi.fn(async () => payFirstIntent()),
        capturePaymentIntent: vi.fn(async () => { calls.push('capture'); }),
        withServicePrices: vi.fn(async (offer: any) => offer),
        placeOrder: vi.fn(async () => { calls.push('place'); return { kind: 'success' as const, order: rawOrder, finalTotal: '100.00', finalCurrency: 'USD', usedOffer: rawOffer }; }),
        cancelOrder: vi.fn(async () => { calls.push('cancelOrder'); return true; }),
        saveOrder: vi.fn(async () => { calls.push('save'); }),
        ...over,
    };
    return { deps, calls };
}

describe('settleAuthorizedFlight', () => {
    it('places the order, records it, then captures — in that order', async () => {
        const { deps, calls } = makeDeps();
        const r = await settleAuthorizedFlight(input, deps);

        expect(r).toMatchObject({ kind: 'settled', capturedMinor: 11_000, order: { orderId: 'ord_1', pnr: 'ABC123', tickets: ['T1'], isTicketed: true } });
        expect(calls).toEqual(['place', 'save', 'capture']);
        expect(deps.capturePaymentIntent).toHaveBeenCalledWith('pi_1', 11_000);
    });

    it('uses a key that is stable per session so a racing second caller cannot buy twice', async () => {
        const { deps } = makeDeps();
        await settleAuthorizedFlight(input, deps);
        expect((deps.placeOrder as any).mock.calls[0][0].idempotencyKey).toBe('flight-order-sess_1');
    });

    it('captures less when the airline order was cheaper than the quote', async () => {
        const { deps } = makeDeps({
            placeOrder: vi.fn(async () => ({ kind: 'success' as const, order: { ...rawOrder, total_amount: '90.00' }, finalTotal: '90.00', finalCurrency: 'USD', usedOffer: rawOffer })),
        });
        const r = await settleAuthorizedFlight(input, deps);
        expect(r.kind).toBe('settled');
        const captured = (deps.capturePaymentIntent as any).mock.calls[0][1] as number;
        expect(captured).toBeLessThan(11_000);
        expect(captured).toBeGreaterThan(0);
    });

    it('fails with flight_unavailable and touches no money when the airline will not sell it', async () => {
        const { deps } = makeDeps({
            placeOrder: vi.fn(async () => ({ kind: 'error' as const, status: 422, data: { errors: [{ code: 'offer_no_longer_available' }] } })),
        });
        const r = await settleAuthorizedFlight(input, deps);
        expect(r).toMatchObject({ kind: 'failed', code: 'flight_unavailable' });
        expect(deps.saveOrder).not.toHaveBeenCalled();
        expect(deps.capturePaymentIntent).not.toHaveBeenCalled();
    });

    it('fails with price_changed when the fare rose beyond tolerance', async () => {
        const { deps } = makeDeps({
            placeOrder: vi.fn(async () => ({ kind: 'price_changed' as const, oldPrice: 100, newPrice: 120, currency: 'USD' })),
        });
        expect(await settleAuthorizedFlight(input, deps)).toMatchObject({ kind: 'failed', code: 'price_changed' });
    });

    it('asks the traveller to re-select extras when the offer had to be replaced', async () => {
        const { deps } = makeDeps({
            placeOrder: vi.fn(async () => ({ kind: 'offer_replaced' as const, newOfferId: 'off_2', newOffer: {} })),
        });
        expect(await settleAuthorizedFlight(input, deps)).toMatchObject({ kind: 'failed', code: 'offer_replaced_seats_cleared' });
    });

    it('cancels the airline order if the capture is refused', async () => {
        const { deps, calls } = makeDeps({ capturePaymentIntent: vi.fn(async () => { throw new Error('card_declined'); }) });
        const r = await settleAuthorizedFlight(input, deps);
        expect(r).toMatchObject({ kind: 'failed', code: 'booking_failed' });
        expect(calls).toContain('cancelOrder');
        expect((deps.cancelOrder as any).mock.calls[0][0]).toBe('ord_1');
    });

    it('cancels the order if it cannot be recorded against the session', async () => {
        const { deps } = makeDeps({ saveOrder: vi.fn(async () => { throw new Error('db down'); }) });
        const r = await settleAuthorizedFlight(input, deps);
        expect(r).toMatchObject({ kind: 'failed', code: 'booking_failed' });
        expect(deps.cancelOrder).toHaveBeenCalled();
        expect(deps.capturePaymentIntent).not.toHaveBeenCalled();
    });

    it('cancels the order if it settled in a different currency than was quoted', async () => {
        const { deps } = makeDeps({
            placeOrder: vi.fn(async () => ({ kind: 'success' as const, order: rawOrder, finalTotal: '100.00', finalCurrency: 'EUR', usedOffer: rawOffer })),
        });
        const r = await settleAuthorizedFlight(input, deps);
        expect(r).toMatchObject({ kind: 'failed', code: 'booking_failed' });
        expect(deps.cancelOrder).toHaveBeenCalled();
        expect(deps.capturePaymentIntent).not.toHaveBeenCalled();
    });

    it('does not capture a payment that was already captured', async () => {
        const { deps } = makeDeps({ retrievePaymentIntent: vi.fn(async () => payFirstIntent({ status: 'succeeded' })) });
        const r = await settleAuthorizedFlight(input, deps);
        expect(r).toMatchObject({ kind: 'settled', capturedMinor: null });
        expect(deps.capturePaymentIntent).not.toHaveBeenCalled();
    });

    it('refuses a payment that is not pay-first, so legacy sessions keep their old behaviour', async () => {
        const { deps } = makeDeps({ retrievePaymentIntent: vi.fn(async () => payFirstIntent({ metadata: {} })) });
        const r = await settleAuthorizedFlight(input, deps);
        expect(r).toMatchObject({ kind: 'failed', code: 'not_pay_first' });
        expect(deps.placeOrder).not.toHaveBeenCalled();
    });

    it('refuses a payment that is neither authorised nor captured', async () => {
        const { deps } = makeDeps({ retrievePaymentIntent: vi.fn(async () => payFirstIntent({ status: 'requires_payment_method' })) });
        const r = await settleAuthorizedFlight(input, deps);
        expect(r).toMatchObject({ kind: 'failed', code: 'booking_failed' });
        expect(deps.placeOrder).not.toHaveBeenCalled();
    });

    it('fails with phone_number_invalid before calling the airline', async () => {
        const { deps } = makeDeps();
        const r = await settleAuthorizedFlight({ ...input, session: { ...session, contact: { ...session.contact, phone: '12' } } }, deps);
        expect(r).toMatchObject({ kind: 'failed', code: 'phone_number_invalid' });
        expect(deps.placeOrder).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/server/flights/settle-authorized-flight.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `settle-authorized-flight.ts`**

```ts
import { applyMarkup, FLIGHT_MARKUP_SPEC } from '@/lib/pricing';
import { computeOrderTotal } from './flight-quote';
import { decideCapture } from './capture-decision';
import { buildDuffelOrderPassengers } from './duffel-order-passengers';
import { mapDuffelOrderError } from './duffel-order-error';
import type { placeDuffelOrder } from './place-duffel-order';
import type { withDuffelServicePrices } from './duffel-service-prices';

/**
 * The card is authorised and no airline order exists yet. Buy it, record it, then take the money.
 *
 * Order matters and is the point of the design:
 *   1. place the order            — if this fails nothing has moved; the caller releases the hold
 *   2. record it on the session   — before anything else can fail (so it is findable by the sweep)
 *   3. capture                    — only now does the traveller pay; if THIS fails, undo the order
 *
 * Runs under createBooking's session lock, so the webhook and /confirm cannot both reach it.
 */

export interface PlacedOrder {
    orderId: string;
    pnr: string;
    tickets: string[];
    isTicketed: boolean;
    orderTotal: string;
    orderCurrency: string;
    rawOrder: any;
}

export type SettleResult =
    | { kind: 'settled'; order: PlacedOrder; /** null when the payment was already captured. */ capturedMinor: number | null }
    | { kind: 'failed'; code: string; message: string };

export interface SettlePaymentIntent {
    id: string;
    status: string;
    amount: number;
    currency: string;
    metadata: Record<string, string>;
}

export interface SettleDeps {
    retrievePaymentIntent(id: string): Promise<SettlePaymentIntent>;
    capturePaymentIntent(id: string, amountToCaptureMinor: number): Promise<void>;
    withServicePrices: typeof withDuffelServicePrices;
    placeOrder: typeof placeDuffelOrder;
    cancelOrder(orderId: string, reason: string): Promise<boolean>;
    saveOrder(sessionId: string, order: PlacedOrder, flight: any): Promise<void>;
}

export interface SettleSession {
    id: string;
    passengers: any[];
    contact: any;
    flight: any;
    seat_service_ids?: string[] | null;
    bag_service_ids?: string[] | null;
}

export interface SettleInput {
    session: SettleSession;
    paymentIntentId: string;
    duffelToken: string;
    /** Absolute rise (supplier currency) treated as unchanged — getFlightPriceTolerance(). */
    priceTolerance: number;
}

const fail = (code: string, message: string): SettleResult => ({ kind: 'failed', code, message });

export async function settleAuthorizedFlight(input: SettleInput, deps: SettleDeps): Promise<SettleResult> {
    const { session, paymentIntentId, duffelToken, priceTolerance } = input;

    const pi = await deps.retrievePaymentIntent(paymentIntentId);
    // Only a PaymentIntent this flow created may trigger an order. Anything else is a legacy
    // session whose missing order is a fault to report, not something to quietly buy.
    if (pi.metadata?.payFirst !== 'true') return fail('not_pay_first', 'Payment is not a pay-first payment.');
    if (pi.status !== 'requires_capture' && pi.status !== 'succeeded') {
        return fail('booking_failed', `Payment is not authorised (status: ${pi.status}).`);
    }

    const rawOffer = session.flight?._rawOffer;
    if (!rawOffer?.id) return fail('booking_failed', 'The stored flight offer is missing.');

    const seatIds = session.seat_service_ids ?? [];
    const bagIds = session.bag_service_ids ?? [];

    // The stored offer is a search result with no service prices. Ask Duffel again, now, so the
    // order total matches what Duffel will validate the payment against.
    let priced: any;
    try {
        priced = await deps.withServicePrices(rawOffer, seatIds, bagIds, duffelToken);
    } catch {
        return fail('seats_unavailable', 'The seats or bags you selected are no longer available.');
    }

    const { total } = computeOrderTotal(priced, seatIds, bagIds, true);
    const built = buildDuffelOrderPassengers(priced, session.passengers, session.contact);
    if (!built.ok) return fail(built.code, built.message);

    const placed = await deps.placeOrder({
        duffelToken,
        rawOffer: priced,
        passengers: built.passengers,
        total,
        currency: priced.total_currency,
        seatServiceIds: seatIds,
        bagServiceIds: bagIds,
        priceTolerance,
        // Stable per session: a second path reaching here with the same key is the same order.
        idempotencyKey: `flight-order-${session.id}`,
    });

    if (placed.kind === 'price_changed') return fail('price_changed', 'The fare changed while we were confirming your booking.');
    if (placed.kind === 'offer_replaced') return fail('offer_replaced_seats_cleared', 'The fare was refreshed, so your seat and bag selections were cleared.');
    if (placed.kind === 'error') {
        const mapped = mapDuffelOrderError(placed.status, placed.data);
        return fail(mapped.code, mapped.message);
    }

    // ── From here an airline order exists and must be undone on any failure ──
    const raw = placed.order;
    const tickets: string[] = (raw.documents ?? [])
        .filter((d: any) => d.type === 'electronic_ticket')
        .map((d: any) => d.unique_identifier as string);
    const order: PlacedOrder = {
        orderId: raw.id,
        // `||`, not `??`: a booking_reference of '' must still fall back to the order id.
        pnr: raw.booking_reference || raw.id,
        tickets,
        isTicketed: tickets.length > 0,
        orderTotal: placed.finalTotal,
        orderCurrency: placed.finalCurrency,
        rawOrder: raw,
    };

    // The quote was in one currency; an order in another would be captured against the wrong unit.
    const quotedCurrency = (pi.metadata.baseCurrency ?? '').toLowerCase();
    if (quotedCurrency && order.orderCurrency.toLowerCase() !== quotedCurrency) {
        console.error(`[settle] CURRENCY DRIFT: quoted in ${quotedCurrency}, order settled in ${order.orderCurrency}.`);
        await deps.cancelOrder(order.orderId, 'order currency differs from the quote');
        return fail('booking_failed', 'The airline settled in a different currency than quoted.');
    }

    try {
        await deps.saveOrder(session.id, order, session.flight);
    } catch (err: any) {
        console.error(`[settle] could not record order ${order.orderId}:`, err?.message ?? err);
        await deps.cancelOrder(order.orderId, 'could not record the order against its session');
        return fail('booking_failed', 'We could not record your booking.');
    }

    if (pi.status === 'succeeded') return { kind: 'settled', order, capturedMinor: null };

    // ── Take the money ───────────────────────────────────────────────────────
    const flat = Number(pi.metadata.flatInBase);
    const decision = decideCapture({
        authorizedMinor: pi.amount,
        quotedBase: Number(pi.metadata.quotedTotal),
        finalBase: Number(order.orderTotal),
        tolerance: priceTolerance,
        chargedFor: base => applyMarkup(base, FLIGHT_MARKUP_SPEC, Number.isFinite(flat) ? flat : 0).chargedPrice,
    });

    if (decision.kind === 'release') {
        await deps.cancelOrder(order.orderId, 'fare rose beyond tolerance after the card was authorised');
        return fail(decision.code, 'The fare changed while we were confirming your booking.');
    }

    try {
        await deps.capturePaymentIntent(pi.id, decision.amountMinor);
    } catch (err: any) {
        console.error(`[settle] capture of ${pi.id} failed after order ${order.orderId} was placed:`, err?.message ?? err);
        await deps.cancelOrder(order.orderId, 'payment capture failed');
        return fail('booking_failed', 'We could not take the payment for your booking.');
    }

    return { kind: 'settled', order, capturedMinor: decision.amountMinor };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/server/flights/settle-authorized-flight.test.ts`
Expected: 13 tests PASS.

- [ ] **Step 5: Add the real wiring `src/lib/server/flights/settle-deps.ts`**

```ts
import { createAdminClient } from '@/utils/postgres/admin';
import { stripe } from '@/lib/stripe/server';
import { env } from '@/utils/env';
import { placeDuffelOrder } from './place-duffel-order';
import { withDuffelServicePrices } from './duffel-service-prices';
import { cancelDuffelOrder } from './duffel-cancel';
import { withBookedItinerary } from './duffel-order-segments';
import type { SettleDeps } from './settle-authorized-flight';

export function defaultSettleDeps(): SettleDeps {
    const db = createAdminClient();
    return {
        async retrievePaymentIntent(id) {
            const pi = await stripe.paymentIntents.retrieve(id);
            return { id: pi.id, status: pi.status, amount: pi.amount, currency: pi.currency, metadata: (pi.metadata ?? {}) as Record<string, string> };
        },

        async capturePaymentIntent(id, amountToCaptureMinor) {
            // amount_to_capture may be LESS than the hold (a cheaper order) but never more.
            await stripe.paymentIntents.capture(id, { amount_to_capture: amountToCaptureMinor }, { idempotencyKey: `flight-capture-${id}` });
        },

        withServicePrices: withDuffelServicePrices,
        placeOrder: placeDuffelOrder,
        cancelOrder: (orderId, reason) => cancelDuffelOrder(env.DUFFEL_TOKEN, orderId, reason),

        async saveOrder(sessionId, order, flight) {
            // Stake a claim first: the smallest possible write, one text column. The fuller update
            // below carries arrays and jsonb, and if it rejects, this id is all that points the
            // orphan sweep at a paid order.
            const claim = await db.from('booking_sessions').update({ duffel_pre_order_id: order.orderId }).eq('id', sessionId);
            if (claim.error) console.error(`[settle] could not stake a claim on order ${order.orderId}: ${claim.error.message}`);

            const { error } = await db.from('booking_sessions').update({
                duffel_pre_order_id: order.orderId,
                duffel_pre_order_pnr: order.pnr,
                duffel_pre_order_tickets: order.tickets,
                duffel_pre_order_ticketed: order.isTicketed,
                // The itinerary actually ticketed; create-booking writes flight_segments from it.
                flight: withBookedItinerary(flight, order.rawOrder),
            }).eq('id', sessionId);
            if (error) throw new Error(error.message);
        },
    };
}
```

- [ ] **Step 6: Type-check, then commit**

Run: `npx tsc --noEmit -p . 2>&1 | grep -E "settle-" | head` — expected: no output.

```bash
git add src/lib/server/flights/settle-authorized-flight.ts src/lib/server/flights/settle-authorized-flight.test.ts src/lib/server/flights/settle-deps.ts
git commit -m "feat: place the airline order after authorisation, then capture or release"
```

---

## Task 8: Failure email, and `createBooking` calls settle

**Files:**
- Modify: `src/lib/server/email.ts` (type at line 110; new functions after `sendFlightRefundEmail`, i.e. after its closing brace)
- Modify: `src/lib/server/flights/create-booking.ts`
- Test: `src/lib/server/flights/booking-not-completed-email.test.ts`

- [ ] **Step 1: Write the failing test for the email builder**

There are no existing email tests, so first check the builder can be imported under Vitest: `npx vitest run src/lib/server/flights/booking-not-completed-email.test.ts` after Step 2. If importing `@/lib/server/email` fails because of missing environment variables, set them in the test with `vi.stubEnv` before a dynamic `import()` rather than changing `email.ts`.

```ts
import { describe, it, expect } from 'vitest';
import { buildFlightBookingNotCompletedEmailHtml } from '@/lib/server/email';

const params = {
    bookingId: 'b-1',
    email: 'ana@example.com',
    passengerName: 'Ana Cruz',
    reason: 'price_changed',
    segments: [{
        airline: 'PR', airlineName: 'Philippine Airlines', flightNumber: 'PR300', origin: 'MNL', destination: 'HKG',
        departureTime: '2026-11-01T06:00:00', arrivalTime: '2026-11-01T08:30:00', itineraryIndex: 0, cabinClass: 'economy',
    }],
};

describe('buildFlightBookingNotCompletedEmailHtml', () => {
    it('says the card was not charged and gives the reason', () => {
        const html = buildFlightBookingNotCompletedEmailHtml(params);
        expect(html).toMatch(/not charged/i);
        expect(html).toMatch(/fare changed/i);
        expect(html).toContain('Ana');
    });

    it('does not tell the traveller about a refund, because none is involved', () => {
        expect(buildFlightBookingNotCompletedEmailHtml(params)).not.toMatch(/refund of|has been refunded/i);
    });

    it('escapes the passenger name', () => {
        const html = buildFlightBookingNotCompletedEmailHtml({ ...params, passengerName: '<script>x</script> Cruz' });
        expect(html).not.toContain('<script>x</script>');
    });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/server/flights/booking-not-completed-email.test.ts`
Expected: FAIL — `buildFlightBookingNotCompletedEmailHtml` is not exported.

- [ ] **Step 3: Add the email**

In `src/lib/server/email.ts`:

1. Widen the type. Old: `export type EmailType = 'confirmation' | 'ticketed' | 'refund' | 'cancellation' | 'awaiting_ticket' | 'price_alert';` New: `export type EmailType = 'confirmation' | 'ticketed' | 'refund' | 'cancellation' | 'awaiting_ticket' | 'price_alert' | 'booking_not_completed';`

2. Import the pure copy helpers near the other imports at the top of the file:
```ts
import { notCompletedReasonCopy } from '@/lib/server/flights/booking-not-completed-copy';
```

3. Insert after the closing brace of `sendFlightRefundEmail` (the line before the `// ═══ FLIGHT CANCELLATION EMAIL` banner):
```ts
// ═════════════════════════════════════════════════════════════════════
//  FLIGHT BOOKING NOT COMPLETED  (card held, airline order failed, hold released)
// ═════════════════════════════════════════════════════════════════════

export interface SendFlightBookingNotCompletedEmailParams {
    /** The failed flight_bookings row — email_logs dedups on (booking_id, email_type). */
    bookingId: string;
    email: string;
    passengerName: string;
    segments: FlightSegmentEmail[];
    /** A pay-first failure code, e.g. 'price_changed'. */
    reason: string;
}

/** Pure render — no I/O. Mirrors the refund email's layout without any refund language. */
export function buildFlightBookingNotCompletedEmailHtml(params: SendFlightBookingNotCompletedEmailParams): string {
    const { bookingId, passengerName, segments, reason } = params;
    const siteUrl = env.SITE_URL;
    const searchUrl = `${siteUrl}/search`;

    const firstName = escapeHtml((passengerName || '').trim().split(/\s+/)[0] || 'there');
    const { route } = flightRouteSummary(segments);
    const itineraryRows = renderFlightItineraryRows(segments);
    const reasonCopy = escapeHtml(notCompletedReasonCopy(reason));
    const preheader = escapeHtml(`We couldn't complete your booking for ${route}. Your card was not charged.`);

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>We couldn't complete your booking</title>
<style>
  @media only screen and (max-width: 620px) {
    .container { width: 100% !important; }
    .px { padding-left: 20px !important; padding-right: 20px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:#eef2f7;">
<span style="display:none;font-size:1px;color:#eef2f7;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</span>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#eef2f7;">
<tr><td align="center" style="padding:20px 12px 32px 12px;">

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="container" style="width:600px;max-width:600px;">

  <!-- Masthead -->
  <tr><td class="px" style="padding:8px 4px 14px 4px;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr>
        <td align="left">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="padding-right:9px;line-height:0;"><img src="${BRAND_ICON_URL}" width="26" height="26" alt="${BRAND_NAME}" style="display:block;width:26px;height:26px;border:0;border-radius:13px;"></td>
            <td style="font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:bold;color:#0f172a;letter-spacing:-0.4px;">${BRAND_WORDMARK_HTML}</td>
          </tr></table>
        </td>
        <td align="right" style="font-size:15px;font-weight:bold;color:#0f172a;letter-spacing:-0.2px;">Hello, ${firstName}</td>
      </tr>
    </table>
  </td></tr>

  <!-- Panel: not completed -->
  <tr><td style="padding:0 0 12px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#ffffff;border:1px solid #e2e8f0;border-radius:18px;">
      <tr><td class="px" style="padding:28px 28px 26px 28px;font-family:Arial,Helvetica,sans-serif;">
        <div style="font-size:20px;line-height:26px;font-weight:bold;color:#0f172a;letter-spacing:-0.4px;">We couldn't complete your booking</div>
        <div style="height:12px;line-height:12px;">&nbsp;</div>
        <div style="font-size:14px;line-height:22px;color:#475569;">${reasonCopy} <strong style="color:#0f172a;">Your card was not charged</strong> &mdash; we've released the hold on it. Your bank may take a few days to drop the pending amount from your statement.</div>
        <div style="height:22px;line-height:22px;">&nbsp;</div>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
          <tr><td align="center" bgcolor="#2563eb" style="border-radius:14px;">
            <a href="${searchUrl}" style="display:block;padding:14px 34px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:14px;mso-line-height-rule:exactly;line-height:18px;">Search flights again</a>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </td></tr>

  <!-- Panel: what you tried to book -->
  <tr><td style="padding:0 0 12px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#ffffff;border:1px solid #e2e8f0;border-radius:18px;">
      <tr><td class="px" style="padding:20px 28px 4px 28px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="font-family:Arial,Helvetica,sans-serif;font-size:14px;">
          <tr>
            <td style="padding:14px 0;color:#64748b;">Passenger</td>
            <td align="right" style="padding:14px 0;color:#0f172a;font-weight:bold;">${escapeHtml(passengerName)}</td>
          </tr>
${itineraryRows}
          <tr>
            <td style="padding:14px 0;border-top:1px solid #eef2f7;color:#64748b;">Status</td>
            <td align="right" style="padding:14px 0;border-top:1px solid #eef2f7;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-left:auto;">
                <tr><td bgcolor="#fff1f2" style="border-radius:999px;padding:5px 11px;font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#e11d48;">Not booked</td></tr>
              </table>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </td></tr>

  <!-- Footer -->
  <tr><td class="px" style="padding:16px 8px 8px 8px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:19px;color:#94a3b8;">
    This is a transactional message about booking attempt ${escapeHtml(bookingId)}.<br>
    &copy; ${new Date().getFullYear()} ${escapeHtml(BRAND_NAME)}. All rights reserved.<br>
    <a href="${siteUrl}/account" style="color:#64748b;text-decoration:underline;">Email preferences</a>
  </td></tr>

</table>

</td></tr>
</table>
</body>
</html>`;
}

export async function sendFlightBookingNotCompletedEmail(
    params: SendFlightBookingNotCompletedEmailParams,
): Promise<SendFlightBookingEmailResult> {
    const { bookingId, email, segments } = params;
    if (!email || !bookingId) return { success: false, error: 'Missing required fields' };

    try {
        const { route } = flightRouteSummary(segments);
        const emailHtml = buildFlightBookingNotCompletedEmailHtml(params);
        const subject = `We couldn't complete your booking – ${route}`;
        const resendApiKey = env.RESEND_API_KEY;

        if (resendApiKey) {
            const res = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ from: FROM_NOREPLY, to: [email], subject, html: emailHtml }),
            });
            const text = await res.text();
            if (res.ok) {
                await logEmail({ bookingId, recipient: email, subject, emailType: 'booking_not_completed', status: 'sent' });
                return { success: true };
            }
            await logEmail({ bookingId, recipient: email, subject, emailType: 'booking_not_completed', status: 'failed', errorMessage: text, htmlBody: emailHtml });
            return { success: false, error: `Resend ${res.status}: ${text}` };
        }

        await logEmail({ bookingId, recipient: email, subject, emailType: 'booking_not_completed', status: 'queued', htmlBody: emailHtml });
        return { success: false, error: 'RESEND_API_KEY not configured' };
    } catch (error) {
        console.error('[sendFlightBookingNotCompletedEmail] Error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Failed to send email' };
    }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/server/flights/booking-not-completed-email.test.ts`
Expected: 3 tests PASS.

- [ ] **Step 5: Wire `createBooking`**

In `src/lib/server/flights/create-booking.ts`:

1. After `import { canonicalBrandName } from '@/lib/brand';` add:
```ts
import { env } from '@/utils/env';
import { getFlightPriceTolerance } from '@/lib/pricing';
import { settleAuthorizedFlight } from '@/lib/server/flights/settle-authorized-flight';
import { defaultSettleDeps } from '@/lib/server/flights/settle-deps';
import { withBookedItinerary } from '@/lib/server/flights/duffel-order-segments';
import { payFirstFailureEntry, NOT_COMPLETED_ERROR_CODE } from '@/lib/server/flights/booking-failure';
import { segmentsForNotCompletedEmail } from '@/lib/server/flights/booking-not-completed-copy';
import { sendFlightBookingNotCompletedEmail } from '@/lib/server/email';
```

2. Return the extras the settle step needs. In the lock's `RETURNING` list, old:
```
                booking_reference,
                charged_price
        `;
```
new:
```
                booking_reference,
                charged_price,
                seat_service_ids,
                bag_service_ids
        `;
```

3. Replace the top of `handleDuffel`. Old:
```ts
    // Duffel pre-order was created synchronously in /api/flights/book (or /api/mobile/flights/book).
    // The order data is stored directly in the session columns.
    const preOrderId: string = session.duffel_pre_order_id ?? '';
    const preOrderPnr: string = session.duffel_pre_order_pnr ?? '';
    const preOrderTickets: string[] = session.duffel_pre_order_tickets ?? [];
    const preOrderTicketed: boolean = session.duffel_pre_order_ticketed === true;

    if (!preOrderId) {
        console.error(`[create-booking] Duffel session ${sessionId} has no pre-order — this session was created without Step 1.5`);
        await sql`UPDATE booking_sessions SET status = 'failed' WHERE id = ${sessionId}`;
        return NextResponse.json({ success: false, error: 'Duffel pre-order missing from session' }, { status: 400 });
    }
```
New:
```ts
    // Sessions from the order-before-payment flow (/api/flights/book with FLIGHT_PAY_FIRST off,
    // or /api/mobile/flights/book) already carry their Duffel order in these columns. A
    // pay-first session reaches here with the card authorised and NO order yet: it is bought
    // below, under this same lock.
    let preOrderId: string = session.duffel_pre_order_id ?? '';
    let preOrderPnr: string = session.duffel_pre_order_pnr ?? '';
    let preOrderTickets: string[] = session.duffel_pre_order_tickets ?? [];
    let preOrderTicketed: boolean = session.duffel_pre_order_ticketed === true;
    let flightForSegments: any = flight;

    if (!preOrderId) {
        const settled = paymentIntentId
            ? await settleAuthorizedFlight({
                session: {
                    id: sessionId, passengers, contact: session.contact, flight,
                    seat_service_ids: session.seat_service_ids, bag_service_ids: session.bag_service_ids,
                },
                paymentIntentId,
                duffelToken: env.DUFFEL_TOKEN,
                priceTolerance: getFlightPriceTolerance(),
            }, defaultSettleDeps())
            : { kind: 'failed' as const, code: 'not_pay_first', message: 'No payment on this session.' };

        if (settled.kind === 'failed') {
            if (settled.code === 'not_pay_first') {
                // Not one of ours: a legacy session that lost its order. Unchanged behaviour.
                console.error(`[create-booking] Duffel session ${sessionId} has no pre-order — this session was created without Step 1.5`);
                await sql`UPDATE booking_sessions SET status = 'failed' WHERE id = ${sessionId}`;
                return NextResponse.json({ success: false, error: 'Duffel pre-order missing from session' }, { status: 400 });
            }

            // Pay-first failure: nothing was captured. Release the hold, keep a failed row that
            // records why, and tell the traveller — they were promised an email either way.
            console.warn(`[create-booking] Pay-first session ${sessionId} could not be completed: ${settled.code} — ${settled.message}`);
            await markFailed(sql, db, sessionId, paymentIntentId, settled.message, settled.code);
            await notifyBookingNotCompleted(sql, { sessionId, session, flight, reason: settled.code });
            return NextResponse.json({
                success: false,
                errorCode: NOT_COMPLETED_ERROR_CODE,
                reason: settled.code,
                error: settled.message,
            }, { status: 409 });
        }

        preOrderId = settled.order.orderId;
        preOrderPnr = settled.order.pnr;
        preOrderTickets = settled.order.tickets;
        preOrderTicketed = settled.order.isTicketed;
        // The itinerary the airline actually holds, not the one the browser posted.
        flightForSegments = withBookedItinerary(flight, settled.order.rawOrder);
    }
```

4. Use that itinerary for the segment rows. Old:
```ts
    await insertFlightSegments(sql, bookingId, flight);

    // ── Insert passengers ────────────────────────────────────────────────
    await insertPassengers(sql, bookingId, passengers, session.user_id, preOrderTickets);
```
New:
```ts
    await insertFlightSegments(sql, bookingId, flightForSegments);

    // ── Insert passengers ────────────────────────────────────────────────
    await insertPassengers(sql, bookingId, passengers, session.user_id, preOrderTickets);
```

5. Record the amount actually taken (a cheaper order is captured for less than the hold). Replace **all** occurrences (two): `confirmedPrice = pi.amount / 100;` → `confirmedPrice = (pi.amount_received || pi.amount) / 100;`

6. Extend `markFailed` to record why. Old signature:
```ts
    paymentIntentId: string,
    reason: string,
) {
```
New:
```ts
    paymentIntentId: string,
    reason: string,
    /** A pay-first failure code; stored on the failed row so the UI can say "not charged". */
    failureCode?: string,
) {
```
Old insert:
```ts
            INSERT INTO flight_bookings (
                session_id, provider, status, payment_intent_id, booking_reference
            )
```
New:
```ts
            INSERT INTO flight_bookings (
                session_id, provider, status, payment_intent_id, booking_reference, cancellation_log
            )
```
Old select tail:
```ts
                bs.booking_reference
            FROM booking_sessions bs
```
New:
```ts
                bs.booking_reference,
                ${failureCode ? JSON.stringify(payFirstFailureEntry(failureCode)) : null}::jsonb
            FROM booking_sessions bs
```

7. Add the notifier after `markFailed`:
```ts
/**
 * Tell the traveller their booking could not be completed and their card was not charged.
 * Best-effort: the failure has already been recorded, and an email problem must not replace it.
 */
async function notifyBookingNotCompleted(
    sql: ReturnType<typeof getSqlAdmin>,
    ctx: { sessionId: string; session: any; flight: any; reason: string },
) {
    try {
        const email: string | undefined = ctx.session.contact?.email;
        if (!email) return;
        const rows = await sql`SELECT id FROM flight_bookings WHERE session_id = ${ctx.sessionId} AND status = 'failed' LIMIT 1`;
        const bookingId: string | undefined = rows[0]?.id;
        if (!bookingId) return;
        const pax0 = ctx.session.passengers?.[0];
        await sendFlightBookingNotCompletedEmail({
            bookingId,
            email,
            passengerName: pax0 ? `${pax0.firstName} ${pax0.lastName}` : 'Traveler',
            segments: segmentsForNotCompletedEmail(ctx.flight),
            reason: ctx.reason,
        });
    } catch (err: any) {
        console.error('[create-booking] could not send the booking-not-completed email:', err?.message ?? err);
    }
}
```

- [ ] **Step 6: Type-check and run the flight tests**

Run: `npx tsc --noEmit -p . 2>&1 | grep -E "create-booking|email.ts" | head` — expected: no output. Then `npx vitest run src/lib/server/flights` — expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/server/email.ts src/lib/server/flights/create-booking.ts src/lib/server/flights/booking-not-completed-email.test.ts
git commit -m "feat: createBooking places the order after authorisation; failure email"
```

> `createBooking` has no unit test (it is SQL-heavy and the repo has none for it). Its behaviour is covered by `settleAuthorizedFlight`'s tests plus the sandbox run in Task 13. Do not skip Task 13.

---

## Task 9: Webhook, `/confirm` and `booking-status`

**Files:**
- Modify: `src/app/api/webhooks/stripe/route.ts`, `src/app/api/flights/confirm/route.ts`, `src/app/api/flights/booking-status/route.ts`

- [ ] **Step 1: `/confirm` accepts an authorised payment and reports why a pay-first booking failed**

In `src/app/api/flights/confirm/route.ts`:

1. Import: after `import { createBooking } from '@/lib/server/flights/create-booking';` add
```ts
import { failedBookingResponse } from '@/lib/server/flights/booking-failure';
```

2. Accept `requires_capture` for Duffel. Old:
```ts
            // Duffel: payment must be fully captured
            if (paymentIntent.status !== 'succeeded') {
```
New:
```ts
            // Duffel: captured (order-before-payment flow), or authorised and waiting for the
            // order to be placed and captured (pay-first flow).
            if (paymentIntent.status !== 'succeeded' && paymentIntent.status !== 'requires_capture') {
```

3. DB-first failed row. Old:
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
New:
```ts
            if (existingBooking.status === 'failed') {
                console.log('[/confirm] Booking already failed for session:', sessionId);
                return NextResponse.json(await failedBookingResponse(supabase, sessionId), { status: 400 });
            }
```

4. Late-webhook failed row. Old:
```ts
        if (lateBooking?.status === 'failed') {
            return NextResponse.json({
                success: false,
                errorCode: 'booking_failed_refunded',
                error: 'Booking failed — the flight offer was no longer available. Your payment has been automatically refunded.',
            }, { status: 400 });
        }
```
New:
```ts
        if (lateBooking?.status === 'failed') {
            return NextResponse.json(await failedBookingResponse(supabase, sessionId), { status: 400 });
        }
```

5. Pass the code through on the generic failure. Old:
```ts
        return NextResponse.json({
            success: false,
            error: bookingData.error || 'Booking failed — your card has not been charged.',
        }, { status: 400 });
```
New:
```ts
        return NextResponse.json({
            success: false,
            errorCode: bookingData.errorCode,
            reason: bookingData.reason,
            error: bookingData.error || 'Booking failed — your card has not been charged.',
        }, { status: 400 });
```

- [ ] **Step 2: `booking-status` returns the reason**

In `src/app/api/flights/booking-status/route.ts`:

1. Import: `import { failureReasonOf, NOT_COMPLETED_ERROR_CODE, NOT_COMPLETED_MESSAGE } from '@/lib/server/flights/booking-failure';`
2. Select the log. Old: `.select('id, pnr, status')` New: `.select('id, pnr, status, cancellation_log')`
3. Old:
```ts
        if (booking.status === 'failed') {
            return NextResponse.json({
```
New:
```ts
        if (booking.status === 'failed') {
            const reason = failureReasonOf(booking);
            if (reason) {
                // A pay-first failure: the card was only held, and the hold has been released.
                return NextResponse.json({
                    found: true,
                    failed: true,
                    errorCode: NOT_COMPLETED_ERROR_CODE,
                    reason,
                    error: NOT_COMPLETED_MESSAGE,
                });
            }
            return NextResponse.json({
```

- [ ] **Step 3: The webhook handles the authorisation event for pay-first Duffel**

In `src/app/api/webhooks/stripe/route.ts`:

1. Update the header comment. Old: ` * Duffel flow (automatic capture):\n *   payment_intent.succeeded → book with Duffel (existing flow, unchanged)` New (append two lines):
```
 * Duffel flow (automatic capture):
 *   payment_intent.succeeded → book with Duffel (existing flow, unchanged)
 *
 * Duffel pay-first flow (FLIGHT_PAY_FIRST, manual capture, metadata.payFirst = 'true'):
 *   payment_intent.amount_capturable_updated → createBooking places the order, then captures
```

2. Route the event. Old:
```ts
        if (provider !== 'mystifly_v2') {
            // Only Mystifly uses manual capture — ignore for other providers
            await commitEvent();
            return NextResponse.json({ received: true });
        }
```
New:
```ts
        if (provider === 'duffel' && pi.metadata?.payFirst === 'true') {
            await handlePayFirstAuthorized(supabase, pi, bookingSessionId);
            await commitEvent();
            return NextResponse.json({ received: true });
        }

        if (provider !== 'mystifly_v2') {
            // Only Mystifly and pay-first Duffel use manual capture — ignore for other providers
            await commitEvent();
            return NextResponse.json({ received: true });
        }
```

3. **Append** these functions to the end of the file (`cat >> … <<'EOF'` or an editor; appending avoids splitting the doc comment that sits above `fireBookingConfirmationEmail`):
```ts
// ─── Pay-first Duffel: the card is authorised, buy the order and take the money ──

/**
 * createBooking does the work under the session lock — place the order, capture, write the rows
 * — and on failure releases the hold and emails the traveller. This only has to finish a
 * success (ticket, email, ledger) and make a failure visible to the team. It never refunds:
 * a failure here means nothing was captured.
 */
async function handlePayFirstAuthorized(supabase: any, pi: Stripe.PaymentIntent, bookingSessionId: string) {
    console.log(`[Webhook] Pay-first card authorised. Session: ${bookingSessionId}`);
    try {
        await supabase
            .from('booking_sessions')
            .update({ status: 'payment_authorized' })
            .eq('id', bookingSessionId)
            .in('status', ['initiated', 'payment_initiated']);

        const bookingData = await createBooking({ sessionId: bookingSessionId, paymentIntentId: pi.id });

        if (bookingData.success) {
            await finishPayFirstBooking(supabase, bookingData, pi, bookingSessionId);
            return;
        }

        if (bookingData.alreadyBooked) {
            // /confirm (or an earlier delivery) holds the session lock and owns this booking.
            console.log(`[Webhook] Pay-first session ${bookingSessionId} is being completed by another path — nothing to do`);
            return;
        }

        if (bookingData.errorCode === 'booking_not_completed') {
            createNotification(
                'Flight booking not completed',
                `Session ${bookingSessionId} (PI ${pi.id}): ${bookingData.reason}. The hold was released and the traveller emailed. No money moved.`,
                'booking',
            );
            return;
        }

        console.error(`[Webhook] Pay-first create-booking failed unexpectedly: ${bookingData.error}`);
        createNotification(
            'Flight booking needs review',
            `Pay-first session ${bookingSessionId} (PI ${pi.id}) failed unexpectedly: ${bookingData.error}. Check Stripe and Duffel before taking any action.`,
            'booking',
        );
    } catch (err) {
        console.error('[Webhook] Pay-first booking error:', err);
        createNotification(
            'Flight booking needs review',
            `Pay-first session ${bookingSessionId} (PI ${pi.id}) threw while booking. Check Stripe and Duffel before taking any action.`,
            'booking',
        );
    }
}

/**
 * The same finishing steps as the payment_intent.succeeded branch (ticket, email, ledger), with
 * the amount taken from what createBooking actually captured rather than the authorised amount.
 * Fold the two together when FLIGHT_PAY_FIRST is retired.
 */
async function finishPayFirstBooking(supabase: any, bookingData: any, pi: Stripe.PaymentIntent, bookingSessionId: string) {
    if (bookingData.status !== 'ticketed' && !bookingData.alreadyBooked && bookingData.bookingId) {
        console.log(`[Webhook] Auto-ticketing Duffel order: ${bookingData.bookingId}`);
        const ticketData = await issueTicket(bookingData.bookingId);
        console.log(ticketData.success ? '[Webhook] Duffel ticketing OK' : `[Webhook] Duffel ticketing failed: ${ticketData.error}`);
    }

    console.log(`[Webhook] Pay-first booking complete. PNR: ${bookingData.pnr}`);

    createNotification('Flight Booking Confirmed', `Duffel booking ${bookingData.pnr || bookingSessionId} confirmed.`, 'booking');
    fireBookingConfirmationEmail(supabase, bookingSessionId, bookingData, 'duffel')
        .catch(e => console.error('[Webhook] Pay-first email error:', e));

    if (bookingData.bookingId) {
        logFlightPaymentEvent(supabase, {
            bookingId: bookingData.bookingId,
            amount: bookingData.confirmedPrice ?? fromStripeAmount(pi.amount, pi.currency || 'usd'),
            currency: (bookingData.confirmedCurrency ?? pi.currency ?? 'usd').toUpperCase(),
            provider: 'duffel',
            transactionId: pi.id,
            metadata: { sessionId: bookingSessionId, pnr: bookingData.pnr },
        });
    }
}
```

- [ ] **Step 4: Type-check, then run everything**

Run: `npx tsc --noEmit -p . 2>&1 | grep -E "webhooks/stripe|flights/confirm|booking-status" | head` — expected: no output. Then `npx vitest run` — expected: PASS (no regressions).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/webhooks/stripe/route.ts src/app/api/flights/confirm/route.ts src/app/api/flights/booking-status/route.ts
git commit -m "feat: webhook, confirm and booking-status understand pay-first bookings"
```

---

## Task 10: Client — waiting state, longer poll, failure copy

**Files:**
- Modify: `src/hooks/flights/useFlightBooking.ts`, `src/app/(main)/flights/book/FlightBookContent.tsx`, `src/locales/{en,zh,ko,ja}.json`
- Test: `src/hooks/flights/booking-poll-window.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { BOOKING_POLL_TIMEOUT_MS } from './useFlightBooking';
import { DEFAULT_ORDER_TIMEOUT_MS } from '@/lib/server/flights/place-duffel-order';

describe('post-payment polling', () => {
    // Pay-first places the airline order AFTER the traveller has paid. If the screen gives up
    // before that call can finish, a booking that is about to succeed is shown as failed.
    it('outlasts the longest the airline order call can take, with room for capture', () => {
        expect(BOOKING_POLL_TIMEOUT_MS).toBeGreaterThan(DEFAULT_ORDER_TIMEOUT_MS + 10_000);
    });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/hooks/flights/booking-poll-window.test.ts`
Expected: FAIL — `BOOKING_POLL_TIMEOUT_MS` is not exported (assertion on `undefined`).

- [ ] **Step 3: Update the hook**

In `src/hooks/flights/useFlightBooking.ts`:

1. After `export const PAYMENT_RECOVERY_WINDOW_MS = 30 * 60 * 1000;` add:
```ts

/**
 * How long the post-payment screen keeps polling for the booking. With pay-first the airline
 * order is placed after the traveller pays, and that call can take up to 130 s, so this has to
 * outlast it (the server-side timeout is DEFAULT_ORDER_TIMEOUT_MS in place-duffel-order.ts).
 */
export const BOOKING_POLL_TIMEOUT_MS = 150_000;
```
2. After `const [clientSecret, setClientSecret] = useState('');` add:
```ts
    // Why a pay-first booking could not be completed (price_changed, flight_unavailable, …).
    const [failureReason, setFailureReason] = useState<string | null>(null);
```
3. Old: `            const POLL_TIMEOUT_MS = 45000;` New: `            const POLL_TIMEOUT_MS = BOOKING_POLL_TIMEOUT_MS;`
4. Old:
```ts
            if (d.failed) {
                clearRecovery();
                setErrorMsg(d.errorCode ? 'CODE:' + d.errorCode : (d.error || 'CODE:booking_failed_refunded'));
```
New:
```ts
            if (d.failed) {
                clearRecovery();
                setFailureReason(d.reason ?? null);
                setErrorMsg(d.errorCode ? 'CODE:' + d.errorCode : (d.error || 'CODE:booking_failed_refunded'));
```
5. Old: `            const errMsg = data?.errorCode ? 'CODE:' + data.errorCode : (data?.error || 'CODE:booking_card_not_charged');` New (add one line after it): 
```ts
            const errMsg = data?.errorCode ? 'CODE:' + data.errorCode : (data?.error || 'CODE:booking_card_not_charged');
            setFailureReason(data?.reason ?? null);
```
6. In the returned object, old:
```ts
        bookingResult,
        clientSecret,
        passengers,
```
New:
```ts
        bookingResult,
        clientSecret,
        failureReason,
        passengers,
```

- [ ] **Step 4: Update `FlightBookContent.tsx`**

1. Translatable codes. Old: `    'booking_failed_refunded',\n    'booking_pending',` New: `    'booking_failed_refunded',\n    'booking_not_completed',\n    'booking_pending',`. Old: `    'phone_number_invalid',\n    'seats_unavailable',` New: `    'phone_number_invalid',\n    'price_changed',\n    'seats_unavailable',`.
2. Take `failureReason` from the hook. Old: `        clientSecret,\n        setStep,\n        pollForBooking,` New: `        clientSecret,\n        failureReason,\n        setStep,\n        pollForBooking,`
3. Error screen. Old:
```tsx
        const displayMsg = errorCode
            ? messageForCode(t, errorCode)
            : (errorMsg || t('error.defaultMessage'));
```
New:
```tsx
        // A pay-first failure: the card was only held and the hold has been released. Say why,
        // when we have copy for the reason, and don't offer "Try Again" on a dead offer.
        const isNotCompleted = errorCode === 'booking_not_completed';
        const reasonMsg = isNotCompleted && failureReason && TRANSLATED_ERROR_CODES.has(failureReason)
            ? messageForCode(t, failureReason)
            : null;
        const displayMsg = errorCode
            ? (reasonMsg ? `${messageForCode(t, errorCode)} ${reasonMsg}` : messageForCode(t, errorCode))
            : (errorMsg || t('error.defaultMessage'));
```
4. Old: `{!isRefunded && !isExpired && (` New: `{!isRefunded && !isExpired && !isNotCompleted && (`
5. Waiting copy. Old: `<p className="text-xs text-slate-400 dark:text-slate-500">{t('dontClosePage')}</p>` New: `<p className="text-xs text-slate-400 dark:text-slate-500">{t('emailConfirmation', { email: contact.email })}</p>`

- [ ] **Step 5: Update the four locale files with a one-off script**

Create `C:\Users\USER\AppData\Local\Temp\claude\c--Users-USER-Documents-GitHub-cheapest-go-app\7f26c32f-c314-4f03-9abc-4d85303166b6\scratchpad\patch-locales.mjs` (outside the repo; do not commit it) and run it from the repo root with `node <that path>`:
```js
import fs from 'node:fs';

const T = {
    en: {
        heading: "Thanks, we're confirming your booking",
        steps: ['Payment authorized', 'Placing your booking', 'Issuing your ticket', 'Sending your confirmation'],
        email: "We'll email your confirmation to {email}. You don't need to wait on this page.",
        notCompleted: "We couldn't complete your booking with the airline.",
        priceChanged: 'The fare changed while we were confirming your booking.',
    },
    zh: {
        heading: '感谢您，我们正在确认您的预订',
        steps: ['付款已授权', '正在提交预订', '正在出票', '正在发送确认邮件'],
        email: '我们会将确认邮件发送至 {email}。您无需停留在此页面。',
        notCompleted: '我们无法通过航空公司完成您的预订。',
        priceChanged: '我们确认预订时票价发生了变化。',
    },
    ko: {
        heading: '감사합니다. 예약을 확인하고 있습니다',
        steps: ['결제 승인 완료', '예약 진행 중', '항공권 발급 중', '확인 메일 발송 중'],
        email: '{email}(으)로 확인 이메일을 보내드립니다. 이 페이지에서 기다리지 않으셔도 됩니다.',
        notCompleted: '항공사를 통해 예약을 완료하지 못했습니다.',
        priceChanged: '예약을 확인하는 동안 요금이 변경되었습니다.',
    },
    ja: {
        heading: 'ありがとうございます。予約を確認しています',
        steps: ['お支払いを承認しました', '予約を処理中', '航空券を発券中', '確認メールを送信中'],
        email: '{email} に確認メールをお送りします。このページで待つ必要はありません。',
        notCompleted: '航空会社での予約を完了できませんでした。',
        priceChanged: '予約の確認中に運賃が変更されました。',
    },
};

for (const [lang, v] of Object.entries(T)) {
    const file = `src/locales/${lang}.json`;
    const raw = fs.readFileSync(file, 'utf8');
    const json = JSON.parse(raw);
    const fb = json.flightBook;
    fb.confirmingBooking = v.heading;
    fb.bookingSteps = v.steps;
    delete fb.dontClosePage;          // flightBook only; the hotel checkout namespace keeps its own
    fb.emailConfirmation = v.email;
    fb.error.codes.booking_not_completed = v.notCompleted;
    fb.error.codes.price_changed = v.priceChanged;

    const eol = raw.includes('\r\n') ? '\r\n' : '\n';
    let out = JSON.stringify(json, null, 2).replace(/\n/g, eol);
    if (/\r?\n$/.test(raw)) out += eol;
    fs.writeFileSync(file, out);
    console.log('patched', file);
}
```
Then run `git diff --stat src/locales`. Expected: each file shows roughly 10–20 changed lines. **If a file shows hundreds of changed lines, the script reformatted it:** run `git checkout src/locales` and make the same six changes by hand with the Edit tool instead.

- [ ] **Step 6: Verify**

Run: `npx vitest run src/hooks/flights src/__tests__/flights` — expected: PASS (including the new poll-window test and the existing payment-recovery tests).
Run: `npx tsc --noEmit -p . 2>&1 | grep -E "FlightBookContent|useFlightBooking" | head` — expected: no output.
Run: `grep -rn "dontClosePage" src/app/\(main\)/flights` — expected: no output.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/flights/useFlightBooking.ts src/hooks/flights/booking-poll-window.test.ts "src/app/(main)/flights/book/FlightBookContent.tsx" src/locales/en.json src/locales/zh.json src/locales/ko.json src/locales/ja.json
git commit -m "feat: email-first waiting screen, 150s poll window, not-charged failure copy"
```

> zh/ko/ja strings are machine-written. Have a native speaker review them before release.

---

## Task 11: Flag in `.env.example` and the decision record

**Files:**
- Modify: `.env.example`, `docs/adr/0009-airline-order-placed-before-payment.md`
- Create: `docs/adr/0045-flight-orders-are-placed-after-the-card-is-authorised.md`

- [ ] **Step 1: `.env.example`**

After the `FLIGHT_MARKUP_FLAT_USD=4.40` line add:
```
# Pay-first web flight booking (docs/adr/0045-…). "on" holds the card first and buys the
# airline order after authorisation; anything else keeps the order-before-payment flow.
FLIGHT_PAY_FIRST=off
```

- [ ] **Step 2: ADR-0045**

```markdown
# Flight orders are placed after the card is authorised

When `FLIGHT_PAY_FIRST=on`, `/api/flights/book` no longer calls Duffel. It prices the trip, get-or-creates one `booking_sessions` row per exact quote (`quote_hash`, enforced by a partial unique index), and creates a PaymentIntent with `capture_method: manual`. When Stripe reports the card authorised, `createBooking` — the one locked path shared by the webhook and `/api/flights/confirm` — places the Duffel order, records it on the session, then captures. If the order fails, the hold is released and the traveller is emailed that their card was not charged.

This supersedes [ADR-0009](0009-airline-order-placed-before-payment.md) for the web flow. That ADR rejected "authorize first, order on capture" because the authorised amount is a guess at what the order will cost. The guess is now bounded and the failure mode is the benign one: a hold can be captured for less than it was authorised for, a rise within `getFlightPriceTolerance()` is absorbed, and a larger rise releases the hold so the traveller sees the new price before paying it. The failure ADR-0009 warned about — money held against no ticket — resolves itself, because a released authorisation is never a charge.

What ADR-0009 optimised for, a quote that cannot drift, is given up in exchange for removing its cost: a real, paid ticket bought on every form submit. Navigating back during the up-to-130-second order call left the first request running with its idempotency key lost; the next submit bought a second ticket, and every abandoned checkout drained the Duffel balance until a sweep that is itself unreliable cancelled it.

## Considered Options

- **Authorise, order, capture (chosen)** — nothing is bought before the card is held. Duplicate submits collapse onto one session and one PaymentIntent at the database.
- **Charge immediately, refund on failure** — rejected. Every failure becomes a charge followed by a refund that can take days to appear.
- **Keep ordering first and harden the dedupe (advisory lock / persisted client key)** — rejected as the primary fix. It narrows the race but keeps the underlying cost: unpaid tickets exist whenever a checkout is abandoned.

## Consequences

- The order call now happens after the traveller has paid and can take up to 130 s. The post-payment screen polls for 150 s and tells the traveller to expect an email instead of waiting.
- A failure after authorisation must be communicated, not just recorded: the `booking_not_completed` email exists for this, attached to the failed `flight_bookings` row (the reason is kept in its `cancellation_log`).
- **Residual risk, unchanged from before:** if the database write that records the booking fails after capture, a paid order can exist without a booking row. The order id is staked on the session first so the sweep and `auto-recover` can find it.
- The `cleanup-orphaned-duffel-orders` sweep remains the safety net for a crash between placing the order and capturing. It must be working before the flag is turned on in production.
- The web route's inline order code (ADR-0009's flow) stays until the flag is retired; the mobile route is unchanged and keeps the old flow and its duplicate-order exposure.
- Sessions in flight at deploy time already hold an order and use automatic capture; they finish through the existing `payment_intent.succeeded` path.
```

- [ ] **Step 3: Mark ADR-0009**

Insert directly under the `# The airline order is placed before the customer pays` heading of `docs/adr/0009-airline-order-placed-before-payment.md`:
```markdown

> **Superseded for the web flow by [ADR-0045](0045-flight-orders-are-placed-after-the-card-is-authorised.md)** when `FLIGHT_PAY_FIRST=on`. Still accurate for the mobile route and while the flag is off.
```

- [ ] **Step 4: Commit**

```bash
git add .env.example docs/adr/0045-flight-orders-are-placed-after-the-card-is-authorised.md docs/adr/0009-airline-order-placed-before-payment.md
git commit -m "docs: ADR-0045 pay-first flight orders, FLIGHT_PAY_FIRST in .env.example"
```

---

## Task 12: Find out why the orphan sweep fails (investigation, not a guess)

Use `superpowers:systematic-debugging`. **Do not "fix" anything before Step 3.** This is a prerequisite for turning the flag on in production: the sweep is the safety net for a crash between placing an order and capturing.

**Known facts:** `cleanup-orphaned-duffel-orders`, `auto-recover` and `retry-emails` exit with curl status 22 (HTTP ≥ 400) on every cron tick, while `poll-pending-tickets` and `refresh-popular-flights` — which use an identical `CRON_SECRET` check — succeed. So it is not (only) auth. `DUFFEL_TOKEN` is read from `DUFFEL_ACCESS_TOKEN`, which is set. Seven unpaid sessions with Duffel orders are 29+ days old and were never expired.

- [ ] **Step 1: Capture the real status and body without side effects**

`retry-emails` only resends queued emails and is a no-op locally without a Resend key, so use it to see what a failing internal route answers:
```bash
docker exec cheapest-go-app-cron-1 sh -c 'curl -s -i -X POST "$APP_URL/api/internal/retry-emails" -H "Authorization: Bearer $CRON_SECRET" | head -20'
```
Record the status line and body.

- [ ] **Step 2: Compare what the container sees**

Without printing secrets, check the app and cron containers agree on the secret and see the same env:
```bash
for c in cheapest-go-app-app-1 cheapest-go-app-cron-1; do echo -n "$c: "; docker exec $c sh -c 'printf %s "$CRON_SECRET" | sha256sum | cut -c1-12'; done
docker logs --since 30m cheapest-go-app-app-1 2>&1 | grep -iE "retry-emails|cleanup-orphaned|auto-recover|Unauthorized|error" | tail -15
```

- [ ] **Step 3: State one hypothesis, then test it**

Write the hypothesis ("X is the cause because Y") in the commit message or a scratch note, change one thing, and re-run Step 1. **Before calling the cleanup route itself**, check the Duffel token prefix is `duffel_test_` (`docker exec cheapest-go-app-app-1 sh -c 'printf %s "$DUFFEL_ACCESS_TOKEN" | cut -c1-12'`) and ask the owner: that route cancels the seven stale orders and marks them `expired`.

- [ ] **Step 4: Regression guard**

Add a test or a startup assertion that would have caught the cause, then confirm the cron log shows `job succeeded` for all three jobs and that `SELECT status, count(*) FROM booking_sessions WHERE provider='duffel' GROUP BY 1;` shows the stale sessions moved to `expired`.

- [ ] **Step 5: Commit** with the cause stated in the message.

---

## Task 13: Sandbox verification (do not skip)

`createBooking` has no unit tests, and the order, the capture and the failure paths all meet there. Verify against **Duffel sandbox and Stripe test mode only**. Use the `run-cheapest-go-app` skill to start and drive the app.

**Preconditions:** `DUFFEL_ACCESS_TOKEN` starts with `duffel_test_`, `STRIPE_SECRET_KEY` starts with `sk_test_`, the Stripe CLI (or the app's webhook route) is receiving test events, and `FLIGHT_PAY_FIRST=on` is set for the app container.

- [ ] **Step 1: Happy path.** Search, select, fill the form, confirm, pay with `4242 4242 4242 4242`. Expect: the waiting screen shows the email message, then success with a PNR. Then:
```sql
SELECT status, duffel_pre_order_id IS NOT NULL AS has_order, payment_intent_id IS NOT NULL AS has_pi, quote_hash IS NOT NULL AS has_hash
FROM booking_sessions ORDER BY created_at DESC LIMIT 1;           -- booked | t | t | t
SELECT status, pnr, confirmed_price FROM flight_bookings ORDER BY created_at DESC LIMIT 1;
```
In Stripe, the PaymentIntent is `succeeded` with `amount_received` equal to the booking's `confirmed_price`.

- [ ] **Step 2: The original bug.** Throttle the network to Slow 3G in devtools, click confirm, press the browser back button immediately, return to the form and confirm again. Expect exactly one new session and one PaymentIntent:
```sql
SELECT count(*) AS sessions, count(DISTINCT quote_hash) AS hashes FROM booking_sessions WHERE created_at > now() - interval '5 minutes';   -- 1 | 1
```
and **no** order bought before paying: `SELECT count(*) FROM booking_sessions WHERE created_at > now() - interval '5 minutes' AND duffel_pre_order_id IS NOT NULL;` → `0`.

- [ ] **Step 3: A declined card buys nothing.** Pay with `4000 0000 0000 0002`. Expect the form to show the decline and `duffel_pre_order_id IS NULL` on the session.

- [ ] **Step 4: Order fails after authorisation.** Before paying, break the stored offer so Duffel refuses it:
```sql
UPDATE booking_sessions SET flight = jsonb_set(flight, '{_rawOffer,id}', '"off_does_not_exist"') WHERE id = '<session id>';
```
Pay with the test card. Expect: the failure screen says the booking could not be completed and the card was **not charged**; the PaymentIntent is `canceled` (hold released); the session is `failed`; and
```sql
SELECT status, cancellation_log FROM flight_bookings WHERE session_id = '<session id>';     -- failed | [{... "reason": "flight_unavailable"}]
SELECT email_type, status FROM email_logs ORDER BY created_at DESC LIMIT 1;                 -- booking_not_completed | queued (no Resend key locally)
```

- [ ] **Step 5: Both paths race.** Pay, then immediately call `/api/flights/confirm` from a second tab while the webhook is processing. Expect one booking row for the session: `SELECT count(*) FROM flight_bookings WHERE session_id = '<id>';` → `1`, and one Duffel order.

- [ ] **Step 6: Flag off still works.** Set `FLIGHT_PAY_FIRST=off`, restart the app, complete one booking. Expect the old behaviour: `duffel_pre_order_id` is set **before** payment.

- [ ] **Step 7: Run the whole suite and record results**

Run: `npx vitest run` — expected: PASS. Write the outcome of Steps 1–6 into the PR description; do not claim a step passed that was not run.

---

## Self-review against the spec

| Spec requirement | Task |
|---|---|
| `/book` keeps checks, drops the order call, adds manual-capture PaymentIntent, get-or-create on `quote_hash` | 5, 6 |
| Repeat submit returns same PaymentIntent; changed details retire the old attempt | 6 |
| Already-authorised repeat answers `booking_pending` | 6 |
| Webhook on `amount_capturable_updated`; `/confirm` fallback; one lock | 8, 9 |
| `createBooking` places the order at the top of the Duffel handler, then capture or release | 7, 8 |
| `placeDuffelOrder` brought to parity (correction to the spec's premise) | 1 |
| Price-drift table (lower / within tolerance / beyond / replaced offer) | 3, 7 |
| Capture failure cancels the order; order id staked immediately | 7 |
| `/confirm` accepts `requires_capture`; failure reason passthrough | 9 |
| 150 s poll window | 10 |
| Email-first waiting copy in en/zh/ko/ja; no "payment received" claim | 10 |
| Failure email, attached to the failed row, via the existing queue | 4, 5, 8 |
| `FLIGHT_PAY_FIRST` flag; old flow untouched while off | 4, 6, 11, 13 |
| One migration; no new session status | 5 |
| ADR superseding 0009 for web | 11 |
| Orphan sweep fixed before production | 12 |
| Regression test for the back-button duplicate | 6 (`REGRESSION`) |
| Sandbox run including back-click | 13 |

**Out of scope, as in the spec:** the mobile route, hotels, and the same-day duplicate warning.

**Open items for the owner (not blockers for coding):** how `db/migrations/*.sql` reach staging and production; whether to add the optional unique indexes on `flight_bookings(session_id)` and `(duffel_order_id)` (no violations locally — check production first); native review of the zh/ko/ja strings.
