---
title: "TravelgateX & Duffel Integration Audit"
subtitle: "Cheapest Go — Payment Flow, Security Hardening & Operations"
date: "2026-05-26"
author: "Engineering Audit"
---

# TravelgateX & Duffel Integration Audit

**Project:** Cheapest Go (`cheapest-go-app`)  
**Date:** 2026-05-26  
**Scope:** Hotel booking via TravelgateX (OTV/RateHawk) and flight booking via Duffel API — payment flow correctness, security hardening, operational readiness

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [TravelgateX Hotel Integration](#2-travelgatex-hotel-integration)
3. [Payment Model: Merchant vs Direct](#3-payment-model-merchant-vs-direct)
4. [OTV/RateHawk Credit Model](#4-otvratehawk-credit-model)
5. [TravelgateX Money Flow](#5-travelgatex-money-flow)
6. [Duffel Flight Integration](#6-duffel-flight-integration)
7. [Duffel Money Flow](#7-duffel-money-flow)
8. [Duffel Balance Operations](#8-duffel-balance-operations)
9. [Stripe Integration](#9-stripe-integration)
10. [Issues Found & Fixed](#10-issues-found--fixed)
11. [Operational Monitoring](#11-operational-monitoring)
12. [Environment Variables Reference](#12-environment-variables-reference)
13. [Pre Go-Live Checklist](#13-pre-go-live-checklist)
14. [File Reference](#14-file-reference)

---

## 1. Architecture Overview

Cheapest Go operates as an **Online Travel Agency (OTA)** using the merchant model:

- **Hotels:** Sourced from Emerging Travel (OTV/RateHawk) via the TravelgateX API gateway
- **Flights:** Sourced from airlines worldwide via the Duffel API
- **Payments:** Collected from customers via Stripe; suppliers paid separately

```
User ──── Stripe (collects gross) ──── Cheapest Go ──┬── OTV (monthly credit invoice)
                                                      └── Duffel (prepaid balance deduction)
```

The spread between gross (customer payment) and net (supplier cost) is the platform's revenue.

### Supplier Payment Models Compared

| | OTV / RateHawk (Hotels) | Duffel (Flights) |
|---|---|---|
| **Model** | Credit line (pay later) | Prepaid balance (pay upfront) |
| **Deduction timing** | Non-refundable: at booking. Refundable: at free-cancel deadline | Immediately on every order |
| **Cash flow** | ~30-day float — collect Stripe before paying OTV | Negative float — Duffel deducts before Stripe pays out |
| **Runs out when** | Credit limit exhausted | Balance hits zero |
| **Payment schedule** | Monthly invoice, pay within 5 working days of receipt | Manual top-up when balance is low |
| **Risk** | Silent auto-cancellation of refundable bookings if credit maxed at deadline | Flight bookings fail if balance = 0 |

---

## 2. TravelgateX Hotel Integration

### 2.1 Supplier Configuration

| Parameter | Value |
|-----------|-------|
| API Endpoint | `https://api.travelgate.com` |
| Auth Header | `Apikey {TRAVELGATEX_API_KEY}` |
| Context | `OTV` |
| Supplier Code | `OTV` (Emerging Travel / RateHawk) |
| Access ID | `38327` |
| Test Mode | `false` (production) |

### 2.2 Booking Flow

```
1. SEARCH
   User selects destination + dates
   → travelgatex-search edge function
   → TGX GraphQL search query (context: OTV)
   → Options returned with paymentType field
   → Non-MERCHANT options filtered out [FIXED]
   → Cheapest option per hotel surfaced to UI

2. PREBOOK
   User selects hotel
   → /api/booking/prebook
   → Fresh search (tokens expire quickly)
   → Quote call to lock price
   → Assert paymentType === MERCHANT [FIXED]
   → Return prebookId = "TGX:{optionRefId}"

3. PAYMENT
   User fills guest details
   → /api/booking/create-payment
   → Apply 15% markup to OTV net price
   → Create Stripe PaymentIntent (automatic capture)
   → Return clientSecret to frontend

4. CONFIRM
   User completes Stripe payment
   → /api/booking/confirm
   → Verify Stripe PaymentIntent succeeded
   → Call travelgatex-book edge function
   → Assert booking.status === "OK" [FIXED]
   → Save booking to database (supplier_cost = OTV net)
   → Send confirmation email

5. CANCEL (if needed)
   → /api/booking/cancel
   → Call travelgatex-cancel edge function
   → Assert cancellation.status === "CANCELLED" [FIXED]
   → Issue Stripe refund (proportional to penalty ratio)
   → OTV credit restored on next invoice cycle
```

### 2.3 GraphQL Operations

**Search Query:**
```graphql
query {
  hotelX {
    search(criteria: $criteriaSearch, settings: $settings) {
      options {
        hotelCode
        paymentType   # "MERCHANT" only — DIRECT filtered out
        status
        price { currency gross net }
        token
      }
    }
  }
}
```

**Book Mutation:**
```graphql
mutation {
  hotelX {
    book(input: $input, settings: $settings) {
      booking {
        reference { supplier client hotel }
        status      # must be "OK" — anything else throws
        price { currency net gross }
        cancelPolicy { refundable cancelPenalties { deadline penaltyType currency value } }
      }
      errors { code type description }
    }
  }
}
```

**Cancel Mutation:**
```graphql
mutation {
  hotelX {
    cancel(input: $input, settings: $settings) {
      cancellation {
        reference { supplier client hotel }
        status   # must be "CANCELLED" — anything else throws
        price { currency net gross }
      }
    }
  }
}
```

### 2.4 Key Configuration

```typescript
// travelgatex-book/index.ts
deltaPrice: { percent: 0, applyBoth: false }
// percent: 0  — quote price is binding; any increase rejects the booking
// applyBoth: false — only rejects upward drift; accepts price decreases
```

---

## 3. Payment Model: Merchant vs Direct

### 3.1 TravelgateX Connection Payment Type (Platform Fee)

This is TravelgateX's fee for the B2B connection — **not** the hotel payment model:

| Type | Meaning |
|------|---------|
| **Free** | No platform fee — development only |
| **STD** | Both sides pay standard booking fee |
| **SUP** | Buyer pays standard + supplement; supplier pays nothing |

Currently **Free** (development). Must change before go-live.

### 3.2 Hotel Booking paymentType

| Type | Meaning | Compatible with Stripe? |
|------|---------|------------------------|
| **MERCHANT** | OTA collects from guest, pays supplier | ✅ Yes — our model |
| **DIRECT** | Guest pays hotel directly | ❌ No |

**Live API verification (2026-05-26):** 48/48 options from OTV access `38327` returned `MERCHANT`. Defensive filtering is enforced in code regardless.

---

## 4. OTV/RateHawk Credit Model

### 4.1 How the Credit Line Works

Source: *Credit Limit Conditions.pptx* (Emerging Travel, April 30, 2026)

RateHawk extends Cheapest Go a **credit line** — not a prepaid balance. This allows bookings to be made without immediate payment.

**Rule 1 — Non-refundable bookings:**
```
Credit is consumed at the moment of booking confirmation.
Booking fails if remaining credit < booking cost.
```

**Rule 2 — Refundable bookings:**
```
Credit is NOT required to make the booking.
Credit must be available when the free cancellation deadline arrives.
If credit is maxed at the deadline → OTV automatically cancels the booking.
```

This is the most dangerous failure mode in the hotel integration:
- User has a confirmed booking and has paid Stripe ✓
- Credit limit fills up with other bookings
- Free cancellation deadline arrives
- OTV cannot secure credit → silently auto-cancels the booking
- Guest arrives at hotel → no room

### 4.2 Payment Terms

| Event | Timing |
|-------|--------|
| Reporting period | All check-in dates within a calendar month |
| Invoice issued | By 3rd of the following month |
| Payment due | Within 5 working days of invoice receipt (~8th of month) |

**Example:**
```
Guest checks out:   April 1, 2026
Invoice sent:       May 4, 2026
Payment due:        May 11, 2026
```

### 4.3 Credit Utilization Calculation

Outstanding credit is tracked by summing `supplier_cost` for all confirmed OTV hotel bookings not yet checked out:

```sql
SELECT SUM(supplier_cost) as outstanding_credit
FROM bookings
WHERE provider = 'travelgatex'
  AND status IN ('confirmed', 'pending')
  AND check_out > NOW()
```

This is a conservative estimate — it treats all bookings (refundable and non-refundable) as consuming credit simultaneously.

### 4.4 Cash Flow Advantage

Unlike Duffel, OTV's credit model creates a favourable cash flow position:

```
Day 1:   User books hotel — Stripe captures gross immediately
Day 1:   OTV credit consumed (not paid yet)
Day ~35: Invoice received (up to 3rd of next month + 5 days)
Day ~35: Pay OTV with Stripe payouts already received

Float window: ~30 days where you hold the customer's payment
              before settling with OTV
```

---

## 5. TravelgateX Money Flow

### 5.1 Per Booking

```
OTV net price:          PHP 10,000   ← stored as supplier_cost
Cheapest Go markup:          +15%
User charged (gross):   PHP 11,500   ← Stripe captures; stored as charged_price

Stripe fee (~2.5%):     -PHP    287
Net in Stripe:           PHP 11,213

OTV monthly invoice:    -PHP 10,000  ← paid ~30 days later
Platform income:         PHP  1,213  (~10.5% effective after Stripe fees)
```

### 5.2 Markup Logic

```
Hotel markup:   15%  (HOTEL_MARKUP)
Bundle markup:  12%  (BUNDLE_MARKUP — hotel + flight package)
```

Applied in `/api/booking/create-payment/route.ts`. The three pricing columns in the database:

| Column | Value | Purpose |
|--------|-------|---------|
| `supplier_cost` | OTV net price | Credit tracking, reconciliation |
| `charged_price` | Stripe gross amount | Revenue reporting |
| `markup_pct` | 0.15 | Audit trail |

### 5.3 Refund Calculation on Cancellation

```
refundRatio = refundAmount / (refundAmount + penaltyAmount)
stripeRefund = paymentIntentAmount × refundRatio
```

`paymentIntentAmount` is the gross (includes markup). The OTV penalty ratio is applied proportionally, preserving the markup structure on the retained penalty portion.

### 5.4 Legal Considerations

1. **Price transparency:** Show the total charged. No requirement to disclose the markup breakdown.
2. **Tax on gross:** VAT/tax must be calculated on what the user pays, not OTV's net cost. Verify with local accountant.
3. **OTV contract:** Confirm RateHawk agreement permits 15% markup. Rate parity clauses may apply.
4. **Terms of Service:** State that you are the merchant of record and prices include a service fee.

---

## 6. Duffel Flight Integration

### 6.1 API Configuration

| Parameter | Value |
|-----------|-------|
| API Endpoint | `https://api.duffel.com` |
| Auth Header | `Bearer {DUFFEL_ACCESS_TOKEN}` |
| API Version | `v2` |
| Idempotency | Required on all order/cancel calls |

### 6.2 Booking Flow

Duffel order is created **before** Stripe payment — offer_requests expire within minutes.

```
1. SEARCH
   → POST /air/offer_requests
   → Returns offers with total_amount, total_currency
   → Cached 10 min in flight_results_cache

2. REVALIDATION
   → revalidate-flight edge function
   → Tolerance: $0.50 live / $10.00 sandbox

3. SESSION CREATION
   → create-booking-session (15 min TTL)

4. DUFFEL PRE-ORDER  ← before Stripe
   → POST /air/orders
   → payments: [{ type: "balance", amount: orderTotal }]
   → Duffel balance deducted immediately
   → Returns order.id, booking_reference, e-tickets
   → Stored in booking_sessions.duffel_pre_order_id

5. STRIPE PAYMENT INTENT
   → Apply 8% markup to Duffel order total
   → capture_method: "automatic"

6. CUSTOMER PAYS → Stripe captures

7. WEBHOOK: payment_intent.succeeded
   → create-booking reuses pre-order (no 2nd Duffel call)
   → Saves PNR to flight_bookings

8. CANCEL
   → GET /air/orders/{id} — check "cancel" in available_actions
   → POST /air/order_cancellations
   → POST /air/order_cancellations/{id}/actions/confirm
   → Issue Stripe refund
```

### 6.3 Duffel Payment Type: Balance

| Type | Description | Compatible |
|------|-------------|-----------|
| **`balance`** | Deduct from pre-funded account | ✅ Current — supports markup |
| **`duffel_payments`** | Duffel collects from customer | ❌ No markup possible |
| **`arc_bsp_cash`** | BSP travel agent settlement | ❌ Not applicable |

`balance` is the correct choice — the only type that allows the markup model.

### 6.4 Orphaned Order Handling

If Stripe PI creation fails after Duffel order is created, the `payment_intent.payment_failed` webhook auto-cancels the orphaned Duffel order:

```typescript
// src/app/api/webhooks/stripe/route.ts (lines 261–331)
// 1. POST /air/order_cancellations  { order_id: duffelOrderId }
// 2. POST /air/order_cancellations/{id}/actions/confirm
// 3. Update booking_sessions.status = 'payment_failed'
```

---

## 7. Duffel Money Flow

### 7.1 Per Booking

```
Duffel net price:        USD 100.00   ← balance deducted immediately
Cheapest Go markup:           +8%
User charged (gross):    USD 108.00   ← Stripe captures

Stripe fee (~2.5%):      -USD   2.70
Net in Stripe:            USD 105.30

Duffel balance debit:    -USD 100.00
Platform income:          USD   5.30  (~5% effective)
```

### 7.2 Cash Flow Gap

```
Duffel deducts:   immediately at order creation
Stripe payout:    2–7 day rolling delay

Gap window:       up to 7 days out-of-pocket
Starting with $50,000 balance at $100/booking avg = 500 bookings runway
```

---

## 8. Duffel Balance Operations

### 8.1 Safe Minimum Balance

```
Minimum buffer = avg_bookings_per_day × avg_ticket_price × 7 days
Example (10/day, $100 avg): 10 × $100 × 7 = $7,000
```

Set `DUFFEL_BALANCE_ALERT_THRESHOLD` to this value in Vercel.

### 8.2 Monitoring (Implemented)

**Cron — every 6 hours** (`/api/cron/duffel-balance-check`):
- Fetches balance from `GET /air/payments/balances`
- Fires admin notification if any currency < threshold

**Pre-booking guard** (live mode only):
- Checks cached balance before creating Duffel order
- Returns HTTP 503 if balance < offer total
- Balance API error is non-fatal (avoids Duffel outage blocking bookings)
- 5-minute module-level cache to avoid per-request API calls

### 8.3 Top-Up Process

1. Withdraw from Stripe (Settings → Payouts)
2. Duffel dashboard → Payments → Top up balance
3. Wire: 1–3 business days. Card: immediate.

---

## 9. Stripe Integration

### 9.1 Capture Methods

| Provider | capture_method | Reason |
|----------|----------------|--------|
| Hotels (OTV) | `automatic` | Confirmed immediately at booking |
| Flights (Duffel) | `automatic` | Order confirmed before PI creation |
| Flights (Mystifly) | `manual` | Hold funds until PNR confirmed; cancel if no PNR |

### 9.2 Webhook Events

| Event | Action |
|-------|--------|
| `payment_intent.succeeded` (Duffel) | create-booking, issue e-ticket |
| `payment_intent.amount_capturable_updated` (Mystifly) | Capture after PNR confirmed |
| `payment_intent.payment_failed` | Cancel orphaned Duffel pre-order |
| `payment_intent.canceled` | Cancel orphaned Duffel pre-order |
| `charge.refunded` | Update booking status to `refunded` |

### 9.3 Security

- CSRF check on all booking mutation routes
- Rate limiting: 5 req/min (book), 10 (confirm), 20 (search)
- Ownership: all operations verify `user_id === authenticated user`
- Stripe signature verification on all webhooks
- Dedup table: `stripe_processed_events` (unique constraint on `event_id`)
- Idempotency keys on all PaymentIntent and refund calls

---

## 10. Issues Found & Fixed

All resolved during audit on 2026-05-26.

### Critical

| # | Issue | File | Fix |
|---|-------|------|-----|
| 1 | Non-MERCHANT hotel options not filtered — DIRECT option would Stripe-charge a guest who pays hotel directly | `travelgatex-search/index.ts` | Filter before `groupByHotel()`; warn on dropped count |
| 2 | No paymentType assertion before Stripe checkout | `prebook/route.ts` | Hard HTTP 409 if quote returns non-MERCHANT |
| 3 | `booking.status` from OTV never checked — ON_REQUEST treated as confirmed | `travelgatex-book/index.ts` | Throw if status `!== 'OK'`; log actual value |
| 4 | `cancellation.status` from OTV never checked — edge function returned 200 even if OTV cancellation unconfirmed | `travelgatex-cancel/index.ts` | Throw if status `!== 'CANCELLED'`; return `otvStatus` in response |

### Financial

| # | Issue | File | Fix |
|---|-------|------|-----|
| 5 | `deltaPrice: 10%` — accepted bookings up to 10% more expensive than quoted, eroding margin | `travelgatex-book/index.ts` | Set to `0%` — quote price is binding |

### Reliability

| # | Issue | File | Fix |
|---|-------|------|-----|
| 6 | No `maxDuration` on hotel routes — OTV cancel averages 13.5s, Vercel default killed it | confirm, cancel, prebook | 120s / 60s / 60s |
| 7 | No `maxDuration` on flight routes | book, cancel-booking, confirm | 120s / 60s / 60s |
| 8 | No `maxDuration` on Stripe webhook — Stripe expects response within 30s | `webhooks/stripe/route.ts` | 30s |

### Operational (New)

| # | Feature | Files |
|---|---------|-------|
| 9 | Duffel balance cron (every 6h) + pre-booking guard | `cron/duffel-balance-check/route.ts`, `flights/duffel-balance.ts` |
| 10 | OTV credit utilization cron (every 12h) + refundable deadline monitor | `cron/otv-credit-check/route.ts` |
| 11 | vercel.json cron entries for both monitors | `vercel.json` |

---

## 11. Operational Monitoring

### 11.1 OTV Credit Monitor (`/api/cron/otv-credit-check`)

Runs every 12 hours. Two checks:

**Credit utilization:**
- Sums `supplier_cost` of all confirmed OTV bookings not yet checked out
- Compares against `OTV_CREDIT_LIMIT` env var
- Alerts admin dashboard if utilization ≥ 80% (configurable)

**Refundable deadline monitor:**
- Finds confirmed refundable OTV bookings whose `free_cancel_deadline` is within 48 hours
- Alerts admin with property name, check-in date, and deadline
- Action: either pay OTV invoice early to restore credit, or manually cancel and refund the user before OTV does it silently

**Environment variables required:**

| Var | Purpose | Example |
|-----|---------|---------|
| `OTV_CREDIT_LIMIT` | Your agreed RateHawk credit limit | `50000` |
| `OTV_CREDIT_UTILIZATION_ALERT_PCT` | Alert threshold (default 0.8 = 80%) | `0.75` |
| `OTV_DEADLINE_ALERT_HOURS` | Deadline warning window (default 48h) | `48` |

### 11.2 Duffel Balance Monitor (`/api/cron/duffel-balance-check`)

Runs every 6 hours.

- Fetches live balance from Duffel API
- Alerts if any currency < `DUFFEL_BALANCE_ALERT_THRESHOLD`
- Pre-booking guard also checks balance at booking time (5-min cache)

**Environment variables required:**

| Var | Purpose | Example |
|-----|---------|---------|
| `DUFFEL_BALANCE_ALERT_THRESHOLD` | Min balance before alert | `7000` |

### 11.3 Monthly Reconciliation (Manual)

At month end, reconcile:

```
OTV invoice total  ==  SUM(supplier_cost) WHERE provider='travelgatex'
                        AND check_in BETWEEN month_start AND month_end

Stripe captures    ==  SUM(charged_price) WHERE provider='travelgatex'
                        AND created_at BETWEEN month_start AND month_end

Platform margin    ==  Stripe captures - OTV invoice - Stripe fees
```

Query available via `get_revenue_stats()` RPC function in Supabase.

---

## 12. Environment Variables Reference

### Required — OTV / TravelgateX

| Variable | Description |
|----------|-------------|
| `TRAVELGATEX_API_KEY` | TravelgateX API key (Apikey auth) |
| `TRAVELGATEX_CLIENT` | Client identifier (`forhuinc`) |
| `OTV_CREDIT_LIMIT` | RateHawk-agreed credit limit in base currency |
| `OTV_CREDIT_UTILIZATION_ALERT_PCT` | Alert at this fraction of limit (default `0.8`) |
| `OTV_DEADLINE_ALERT_HOURS` | Warn before free-cancel deadline (default `48`) |

### Required — Duffel

| Variable | Description |
|----------|-------------|
| `DUFFEL_ACCESS_TOKEN` | Duffel API token (starts with `duffel_live_` in production) |
| `DUFFEL_BALANCE_ALERT_THRESHOLD` | Min balance before alert (e.g. `7000`) |

### Required — Stripe

| Variable | Description |
|----------|-------------|
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |

### Required — Supabase

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server-side only) |

### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `CRON_SECRET` | Bearer token for cron route auth | none |
| `TRAVELGATEX_TEST_MODE` | Enable TGX test mode | `false` |

---

## 13. Pre Go-Live Checklist

### OTV / TravelgateX

- [ ] Change connection payment type from **Free → STD** in TravelgateX admin (Emerging Travel connection)
- [ ] Set `OTV_CREDIT_LIMIT` in Vercel to your agreed RateHawk credit amount
- [ ] Confirm RateHawk contract allows 15% markup (check rate parity clauses)
- [ ] Set up tax collection on gross price (local accountant sign-off)
- [ ] Add merchant-of-record language to Terms of Service
- [ ] Verify first monthly invoice reconciles to DB `supplier_cost` totals

### Duffel

- [ ] Confirm `DUFFEL_ACCESS_TOKEN` starts with `duffel_live_` (not `duffel_test_`)
- [ ] Set `DUFFEL_BALANCE_ALERT_THRESHOLD` to 7-day runway value
- [ ] Pre-fund Duffel account with sufficient balance for launch volume
- [ ] Set Stripe payout to automatic daily to minimize top-up lag

### Stripe

- [ ] Confirm webhook endpoint is registered for all 5 event types
- [ ] Verify `STRIPE_WEBHOOK_SECRET` matches live webhook signing secret
- [ ] Confirm Vercel plan supports `maxDuration` up to 120s (requires Pro)

### General

- [ ] Set `CRON_SECRET` and register it in Vercel cron auth
- [ ] Verify all 4 cron jobs appear in Vercel dashboard after deploy
- [ ] Run manual test of `/api/cron/otv-credit-check` and `/api/cron/duffel-balance-check`
- [ ] Confirm admin notifications table is accessible in dashboard

---

## 14. File Reference

### TravelgateX / Hotels

| File | Purpose |
|------|---------|
| `supabase/functions/travelgatex-search/index.ts` | Search; MERCHANT filter |
| `supabase/functions/travelgatex-search/search.ts` | GraphQL query |
| `supabase/functions/travelgatex-search/transform.ts` | Option → hotel transform |
| `supabase/functions/travelgatex-quote/index.ts` | Quote handler |
| `supabase/functions/travelgatex-book/index.ts` | Book; status guard; deltaPrice=0 |
| `supabase/functions/travelgatex-cancel/index.ts` | Cancel; status guard |
| `src/lib/server/travelgatex.ts` | Gateway dispatcher |
| `src/app/api/booking/prebook/route.ts` | Prebook; MERCHANT assert; maxDuration=60 |
| `src/app/api/booking/confirm/route.ts` | Confirm; maxDuration=120 |
| `src/app/api/booking/cancel/route.ts` | Cancel; maxDuration=60 |
| `src/app/api/booking/create-payment/route.ts` | Stripe PI; 15% markup |
| `src/lib/server/bookings.ts` | Core booking/cancel logic |
| `src/lib/server/cancellation-engine.ts` | Cancel penalty calculation |
| `src/app/api/cron/otv-credit-check/route.ts` | OTV credit + deadline monitor |

### Duffel / Flights

| File | Purpose |
|------|---------|
| `src/app/api/flights/book/route.ts` | Pre-order; balance guard; Stripe PI; maxDuration=120 |
| `src/app/api/flights/confirm/route.ts` | Fallback confirm; maxDuration=60 |
| `src/app/api/flights/cancel-booking/route.ts` | Cancel + refund; maxDuration=60 |
| `src/app/api/webhooks/stripe/route.ts` | Webhook; orphan cancel; maxDuration=30 |
| `src/lib/server/flights/duffel-balance.ts` | Balance utility; 5-min cache |
| `src/app/api/cron/duffel-balance-check/route.ts` | Balance monitor cron |
| `supabase/functions/_shared/duffelClient.ts` | Duffel API client |
| `supabase/functions/create-booking/index.ts` | Pre-order reuse; fallback booking |
| `supabase/functions/issue-ticket/index.ts` | E-ticket issuance |

### Database

| Migration | Purpose |
|-----------|---------|
| `001_create_bookings_table.sql` | Base bookings schema |
| `004_booking_policy_system.sql` | Policy snapshots + tiers |
| `20260413000000_add_financial_audit_to_hotels.sql` | `supplier_cost`, `charged_price`, `markup_pct` |
| `20260428000000_add_provider_to_bookings.sql` | `provider`, `provider_metadata` |

---

*Generated from engineering audit session — 2026-05-26*
