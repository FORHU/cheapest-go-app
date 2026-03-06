# ✈️ CheapestGo — Travel Booking Platform

A full-stack travel booking platform built with **Next.js 16**, **Supabase**, and **Stripe**. Supports hotel and flight search, booking, and payment — with multi-city itineraries, real-time flight availability, and AI-powered trip planning.

---

## 🚀 Features

### Flights
- **Multi-provider search** — Duffel Airways + Mystifly (V1 & V2 branded fares) aggregated in parallel
- **All trip types** — One-way, Round-trip, Multi-city
- **Smart sorting & filtering** — By price, duration, stops, airline
- **Production-grade booking flow** — Passenger details → Stripe authorization → PNR confirmation
- **Manual capture for Mystifly** — Card held until PNR is secured; never charged on failure
- **E-ticket issuance** — Auto-ticketing via Duffel after payment
- **Background ticket polling** — `poll-pending-tickets` auto-refunds if Mystifly ticketing fails
- **Booking management** — View past, upcoming, and cancelled flights in `/trips`

### Hotels
- **LiteAPI integration** — Search, prebook, and book hotels globally
- **Voucher support** — Discount code validation at checkout
- **Reviews & facilities** — Fetched from LiteAPI
- **Interactive map** — Mapbox GL powered property map with pin clustering

### AI & UX
- **AI search bar** — Natural language flight and hotel search
- **AI itinerary generator** — Day-by-day trip planner with map integration
- **Dark mode** — Full dark/light theme support
- **Mobile-first** — Fully responsive with bottom-sheet modals

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| Animation | Framer Motion |
| State | Zustand + TanStack Query |
| Backend | Supabase (Postgres + Edge Functions + Auth) |
| Payments | Stripe (Embedded Checkout, Manual Capture) |
| Email | Resend |
| Maps | Mapbox GL / react-map-gl |
| Icons | Lucide React |
| Validation | Zod |

---

## 💳 Payment & Booking Flow

### Mystifly (Manual Capture — PNR before charge)

```
1. User selects flight + fills passenger details
2. Server creates booking session (status: initiated)
3. Stripe PaymentIntent created with capture_method: manual
   → Card is AUTHORIZED (held) but NOT charged yet
4. User completes payment → status: requires_capture
5. Stripe fires: payment_intent.amount_capturable_updated
6. Webhook calls create-booking edge function:
   ├─ Calls Mystifly CreateBooking
   ├─ No PNR returned → cancel PaymentIntent (user never charged)
   └─ PNR returned    → capture PaymentIntent (charge card now)
       ├─ TicketStatus: Ticketed  → status: ticketed ✅
       └─ TicketStatus: Pending   → status: awaiting_ticket
           └─ poll-pending-tickets runs every 5 min:
               ├─ Ticketed → update to ticketed, send email ✅
               └─ Failed   → auto Stripe refund, status: failed ❌
```

### Duffel (Automatic Capture — standard flow)

```
1. User selects flight + fills passenger details
2. Server creates booking session
3. Stripe PaymentIntent created (automatic capture)
4. User completes payment → status: succeeded
5. Stripe fires: payment_intent.succeeded
6. Webhook calls create-booking → Duffel order created → PNR
7. issue-ticket called automatically → e-ticket issued
```

### Resilience — /api/flights/confirm (Fallback)

Frontend always calls `/api/flights/confirm` after payment for instant UX:
- **Checks DB first** — if webhook already ran, returns PNR immediately
- **Fallback** — if webhook hasn't run yet (local dev / delay), triggers booking directly
- Atomic session lock in `create-booking` prevents any double-booking

### Booking Status State Machine

```
booking_sessions:  initiated → payment_authorized → processing → booked / failed / expired

flight_bookings:   pnr_created → awaiting_ticket → ticketed
                              └─ failed (→ Stripe refund)
                   booked → ticketed           (Duffel path)
```

---

## 📦 Supabase Edge Functions

| Function | Description |
|---|---|
| `unified-flight-search` | Orchestrates parallel search across all providers |
| `duffel-search` | Duffel Airways flight search |
| `mystifly-search` | Mystifly V1 (lowest fares) search |
| `mystifly-v2-search` | Mystifly V2 (branded fares) search |
| `create-booking-session` | Stores flight + passenger data before payment |
| `create-booking` | Books with provider, handles Stripe capture/cancel, saves PNR |
| `poll-pending-tickets` | Polls Mystifly for ticket status; auto-refunds on failure |
| `issue-ticket` | Auto-tickets Duffel orders post-payment |
| `revalidate-flight` | Re-checks fare availability before checkout |
| `liteapi-search` | Hotel availability search |
| `liteapi-prebook-v2` | Hotel pre-booking (price lock) |
| `liteapi-book-v2` | Confirms hotel booking |
| `liteapi-autocomplete` | Location autocomplete for hotel search |
| `liteapi-reviews` | Fetches hotel reviews |
| `liteapi-facilities` | Fetches hotel facilities |
| `liteapi-cancel-booking` | Cancels hotel bookings |
| `vouchers-validate` | Validates discount voucher codes |

---

## ⚙️ Environment Variables

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=
SUPABASE_SERVICE_ROLE_KEY=          # Server-only — never expose to client

# Stripe
STRIPE_SECRET_KEY=                  # Server-only
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=              # From: stripe listen --print-secret

# Mystifly
MYSTIFLY_BASE_URL=
MYSTIFLY_USERNAME=
MYSTIFLY_PASSWORD=
MYSTIFLY_TENANT_ID=

# Duffel
DUFFEL_ACCESS_TOKEN=

# Email (Resend)
RESEND_API_KEY=

# Maps (Mapbox)
NEXT_PUBLIC_MAPBOX_TOKEN=
```

---

## 🧑‍💻 Local Development

### Prerequisites
- Node.js 20+
- pnpm
- [Supabase CLI](https://supabase.com/docs/guides/cli)
- [Stripe CLI](https://stripe.com/docs/stripe-cli) (for local webhook forwarding)

### Install & Run

```bash
pnpm install
pnpm dev
```

App runs at [http://localhost:3000](http://localhost:3000).

### Stripe Webhook Forwarding (Local)

Mystifly uses `amount_capturable_updated`. Duffel uses `payment_intent.succeeded`. Forward both:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

> Without `stripe listen`, the `/api/flights/confirm` fallback endpoint handles booking automatically.

### Deploy Supabase Edge Functions

```bash
# Deploy all functions
npx supabase functions deploy --no-verify-jwt

# Deploy a specific function
npx supabase functions deploy create-booking --no-verify-jwt
npx supabase functions deploy poll-pending-tickets --no-verify-jwt
```

### Database Migrations

```bash
npx supabase db push
```

Or run SQL directly in the [Supabase SQL Editor](https://supabase.com/dashboard).

### Set Up Ticket Polling (Production)

Enable `pg_cron` and `pg_net` extensions in Supabase Dashboard → Database → Extensions, then run:

```sql
SELECT cron.schedule(
  'poll-pending-tickets',
  '*/5 * * * *',
  $$SELECT net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/poll-pending-tickets',
    headers := '{"Authorization": "Bearer <service_role_key>"}'::jsonb,
    body := '{}'::jsonb
  )$$
);
```
## pg_cron
Verify the job is registered:
```sql
SELECT jobid, jobname, schedule, active FROM cron.job;
```

Monitor execution history:
```sql
SELECT jobid, status, start_time, end_time, return_message
FROM cron.job_run_details
ORDER BY start_time DESC
LIMIT 10;
```

---

## 🗂 Project Structure

```
src/
├── app/
│   ├── (main)/
│   │   ├── page.tsx          # Landing page
│   │   ├── flights/          # Flight search & booking
│   │   ├── search/           # Hotel search results
│   │   ├── property/         # Hotel detail page
│   │   ├── trips/            # My bookings
│   │   └── account/          # User account
│   ├── api/
│   │   ├── flights/
│   │   │   ├── book/         # Creates booking session + PaymentIntent
│   │   │   ├── confirm/      # DB-first fallback (checks webhook ran first)
│   │   │   └── search/       # Flight search orchestration
│   │   ├── hotels/           # Hotel API routes
│   │   └── webhooks/stripe/  # Stripe webhook (Mystifly + Duffel handlers)
│   └── auth/                 # Supabase auth callbacks
├── components/
│   ├── landing/hero/         # Search bar, AI search, date pickers
│   ├── flights/              # Flight cards, filters, results
│   ├── trips/                # Booking history cards
│   ├── checkout/             # Stripe embedded checkout
│   └── ui/                   # Shared UI components
├── hooks/
│   ├── flights/              # useFlightBooking
│   └── search/               # useFlightSearch, useSearchModule
├── lib/
│   ├── flights/              # Types, normalization, provider interfaces
│   ├── stripe/               # Stripe server client
│   └── server/               # Auth utilities, email
├── stores/                   # Zustand global state
└── utils/                    # Supabase client utilities

supabase/
├── functions/                # Deno Edge Functions
│   ├── _shared/              # Shared clients (Duffel, Mystifly, LiteAPI)
│   ├── create-booking/       # Full state machine — PNR + capture/cancel
│   ├── poll-pending-tickets/ # Background polling + auto-refund
│   └── ...
└── migrations/               # Database schema migrations
```

---

## 🔐 Security

- Server-side auth enforced on all booking API routes
- `user_id` always extracted from Supabase JWT — never trusted from client
- `SUPABASE_SERVICE_ROLE_KEY` and `STRIPE_SECRET_KEY` are server-only
- Atomic session locking prevents double-booking from concurrent webhook + confirm calls
- Manual Stripe capture for Mystifly — card never charged if supplier booking fails

---

## 📄 License

Private — all rights reserved.
