-- Add seat_number to passengers so assigned seats are persisted at booking time.
-- Populated for Duffel bookings from order.passengers[].seats[].designator.
-- NULL when no seat was pre-selected or the airline hasn't assigned one yet.

alter table passengers
    add column if not exists seat_number text default null;
