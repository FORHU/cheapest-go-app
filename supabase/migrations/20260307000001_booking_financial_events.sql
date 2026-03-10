-- Migration: 20260307000001_booking_financial_events.sql
-- Description: Creates an immutable audit ledger for all financial operations

CREATE TABLE IF NOT EXISTS booking_financial_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL REFERENCES flight_bookings(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (event_type IN ('payment', 'refund', 'supplier_reconciliation')),
    amount NUMERIC(12,2) NOT NULL,
    currency TEXT NOT NULL,
    provider TEXT NOT NULL,
    transaction_id TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookup by booking ID
CREATE INDEX IF NOT EXISTS idx_booking_financial_events_booking_id ON booking_financial_events(booking_id);

-- Index for searching transaction IDs globally (e.g. Stripe charge IDs)
CREATE INDEX IF NOT EXISTS idx_booking_financial_events_transaction_id ON booking_financial_events(transaction_id);

-- RLS: Only admins/service roles can insert or view
ALTER TABLE booking_financial_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Financial events are readable by admins" ON booking_financial_events
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM auth.users WHERE auth.uid() = id AND raw_user_meta_data->>'role' = 'admin'));

-- Implicit service role bypasses RLS so Edge functions can insert freely.
