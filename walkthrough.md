# Cronjob Documentation

This document summarizes the background jobs (cronjobs) identified in the codebase. These jobs are primarily implemented as Supabase Edge Functions and scheduled using `pg_cron`.

## 1. Refresh Popular Flights
- **Location**: [index.ts](file:///c:/Users/USER/Documents/GitHub/TravelBooking-Korean/supabase/functions/refresh-popular-flights/index.ts)
- **Schedule**: Every 30 minutes (`*/30 * * * *`)
- **Function**:
    - Queries the `flight_search_stats` table for the top 5 most searched routes.
    - Triggers a background search for each route via the internal API.
    - Ensures that popular routes have up-to-date pricing and availability in the cache.

## 2. Refresh Deal Prices
- **Location**: [index.ts](file:///c:/Users/USER/Documents/GitHub/TravelBooking-Korean/supabase/functions/refresh-deal-prices/index.ts)
- **Schedule**: Every 6 hours (`0 */6 * * *`)
- **Function**:
    - Iterates through all active flight deals in the `flight_deals` table.
    - Calls the unified flight search to get the current "live price" for each deal.
    - Updates the deal's price, airline, and "ends in" timer.
    - Recalculates discount tags (e.g., "20% OFF") based on the `baseline_price`.

## 3. Poll Pending Tickets
- **Location**: [index.ts](file:///c:/Users/USER/Documents/GitHub/TravelBooking-Korean/supabase/functions/poll-pending-tickets/index.ts)
- **Schedule**: Every 5 minutes (suggested in docs)
- **Function**:
    - Monitors bookings with the status `awaiting_ticket` (specifically for Mystifly).
    - Checks the provider's API for ticket issuance.
    - **Success**: Updates status to `ticketed` and sends confirmation emails with e-ticket numbers.
    - **Failure/Expiry**: Automatically triggers a Stripe refund and marks the booking as `failed`.

## 4. Flight Reconciliation Job
- **Location**: [index.ts](file:///c:/Users/USER/Documents/GitHub/TravelBooking-Korean/supabase/functions/flight-reconciliation-job/index.ts)
- **Schedule**: Nightly (intended)
- **Function**:
    - Detects "data drift" between the local database and external providers (Duffel/Mystifly).
    - Checks bookings in transient states (`booked`, `awaiting_ticket`, `cancel_requested`).
    - Syncs the local booking status with the provider's ground truth.
    - Logs financial events if discrepancies/refunds are found.

## 5. Internal Refresh API
- **Location**: [route.ts](file:///c:/Users/USER/Documents/GitHub/TravelBooking-Korean/src/app/api/internal/refresh-flights/route.ts)
- **Purpose**: A secure internal endpoint used by the cronjobs to trigger searches and update the flight cache without requiring user interaction.
