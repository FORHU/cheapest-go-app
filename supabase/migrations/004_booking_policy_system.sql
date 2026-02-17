-- ============================================================================
-- Booking Policy Snapshot System
-- Captures immutable LiteAPI policy at booking time.
-- ============================================================================

-- 1. Enum for policy classification
DO $$ BEGIN
  CREATE TYPE booking_policy_type AS ENUM (
    'free_cancellation',
    'non_refundable',
    'partial_refund',
    'tiered'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE refund_status AS ENUM (
    'pending',
    'approved',
    'processed',
    'rejected',
    'failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Immutable policy snapshot — one per booking
CREATE TABLE IF NOT EXISTS booking_policy_snapshots (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id      TEXT NOT NULL REFERENCES bookings(booking_id) ON DELETE CASCADE,

  -- Classified policy type (derived from LiteAPI response)
  policy_type     booking_policy_type NOT NULL DEFAULT 'non_refundable',

  -- Human-readable summary  (e.g. "Free cancellation before Jan 15")
  summary         TEXT,

  -- LiteAPI refundable tag  (e.g. "REFUNDABLE", "NON-REFUNDABLE")
  refundable_tag  TEXT,

  -- Hotel remarks array
  hotel_remarks   TEXT[] DEFAULT '{}',

  -- No-show penalty (flat amount in booking currency)
  no_show_penalty DECIMAL(10, 2) DEFAULT 0,

  -- Early departure fee (flat amount in booking currency)
  early_departure_fee DECIMAL(10, 2) DEFAULT 0,

  -- Free cancellation deadline (NULL if non-refundable)
  free_cancel_deadline TIMESTAMPTZ,

  -- Full verbatim LiteAPI response — immutable audit trail
  raw_liteapi_response JSONB NOT NULL DEFAULT '{}',

  -- Snapshot metadata
  captured_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  api_version     TEXT,

  CONSTRAINT uq_policy_per_booking UNIQUE (booking_id)
);

-- 3. Tiered penalty rules — ordered by deadline
CREATE TABLE IF NOT EXISTS policy_tiers (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  snapshot_id     UUID NOT NULL REFERENCES booking_policy_snapshots(id) ON DELETE CASCADE,

  -- Deadline: cancel before this time to get this tier's penalty
  cancel_deadline TIMESTAMPTZ NOT NULL,

  -- Penalty
  penalty_amount  DECIMAL(10, 2) NOT NULL DEFAULT 0,
  penalty_type    TEXT NOT NULL DEFAULT 'fixed'
                    CHECK (penalty_type IN ('fixed', 'percent', 'nights')),
  currency        TEXT DEFAULT 'PHP',

  -- Ordering
  tier_order      INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT uq_tier_order UNIQUE (snapshot_id, tier_order)
);

-- 4. Refund audit log — every refund attempt/outcome
CREATE TABLE IF NOT EXISTS refund_logs (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id        TEXT NOT NULL REFERENCES bookings(booking_id) ON DELETE CASCADE,
  policy_snapshot_id UUID REFERENCES booking_policy_snapshots(id),
  user_id           UUID NOT NULL,

  -- Refund details
  refund_type       TEXT NOT NULL
                      CHECK (refund_type IN (
                        'full_refund', 'partial_refund', 'no_show_charge',
                        'early_departure_charge', 'policy_override'
                      )),
  requested_amount  DECIMAL(10, 2) NOT NULL,
  approved_amount   DECIMAL(10, 2),
  currency          TEXT DEFAULT 'PHP',

  -- Penalty applied (from policy tier)
  penalty_amount    DECIMAL(10, 2) DEFAULT 0,
  applied_tier_id   UUID REFERENCES policy_tiers(id),

  -- Status tracking
  status            refund_status NOT NULL DEFAULT 'pending',
  status_reason     TEXT,

  -- External reference (payment gateway refund ID)
  external_ref      TEXT,

  -- Timestamps
  requested_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at      TIMESTAMPTZ,
  processed_by      TEXT  -- 'system' | 'admin' | admin user id
);

-- 5. Extend bookings table
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS policy_type TEXT DEFAULT 'non_refundable',
  ADD COLUMN IF NOT EXISTS policy_snapshot_id UUID
    REFERENCES booking_policy_snapshots(id);

-- 6. Indexes
CREATE INDEX IF NOT EXISTS idx_policy_snapshot_booking
  ON booking_policy_snapshots(booking_id);
CREATE INDEX IF NOT EXISTS idx_policy_tiers_snapshot
  ON policy_tiers(snapshot_id, tier_order);
CREATE INDEX IF NOT EXISTS idx_refund_logs_booking
  ON refund_logs(booking_id);
CREATE INDEX IF NOT EXISTS idx_refund_logs_status
  ON refund_logs(status);
CREATE INDEX IF NOT EXISTS idx_refund_logs_user
  ON refund_logs(user_id);

-- 7. RLS
ALTER TABLE booking_policy_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE refund_logs ENABLE ROW LEVEL SECURITY;

-- Snapshots: users can read their own (via booking ownership)
CREATE POLICY "snapshot_read_own" ON booking_policy_snapshots
  FOR SELECT TO authenticated
  USING (
    booking_id IN (
      SELECT booking_id FROM bookings WHERE user_id = auth.uid()
    )
  );

-- Tiers: readable via snapshot→booking chain
CREATE POLICY "tiers_read_own" ON policy_tiers
  FOR SELECT TO authenticated
  USING (
    snapshot_id IN (
      SELECT bps.id FROM booking_policy_snapshots bps
      JOIN bookings b ON b.booking_id = bps.booking_id
      WHERE b.user_id = auth.uid()
    )
  );

-- Refund logs: users see their own
CREATE POLICY "refund_read_own" ON refund_logs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Insert policies (service role inserts via server, but allow user insert for refund requests)
CREATE POLICY "snapshot_insert_service" ON booking_policy_snapshots
  FOR INSERT TO authenticated
  WITH CHECK (
    booking_id IN (
      SELECT booking_id FROM bookings WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "refund_insert_own" ON refund_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
