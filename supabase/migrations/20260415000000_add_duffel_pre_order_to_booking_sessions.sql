-- Store Duffel pre-order data directly in booking_sessions so create-booking
-- can use it without a Stripe API round-trip from the edge function.

ALTER TABLE booking_sessions
    ADD COLUMN IF NOT EXISTS duffel_pre_order_id text DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS duffel_pre_order_pnr text DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS duffel_pre_order_tickets text[] DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS duffel_pre_order_ticketed boolean DEFAULT NULL;
