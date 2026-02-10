-- ============================================================================
-- Vouchers/Promo Code System
-- Follows LiteAPI OTA booking pattern:
--   prebook → apply voucher (server-validated) → book with final price
-- ============================================================================

-- Vouchers table: stores all promo codes and their rules
CREATE TABLE IF NOT EXISTS vouchers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',

  -- Discount configuration
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  discount_value DECIMAL(10, 2) NOT NULL CHECK (discount_value > 0),

  -- Constraints
  min_booking_amount DECIMAL(10, 2),
  max_discount_amount DECIMAL(10, 2),

  -- Categorization
  category TEXT NOT NULL DEFAULT 'general'
    CHECK (category IN ('general', 'first_time', 'location_based', 'hotel_specific', 'seasonal')),

  -- Targeting (nullable = applies to all)
  hotel_ids TEXT[], -- specific hotel IDs this voucher applies to
  location_codes TEXT[], -- specific location codes (city/country)

  -- Validity period
  valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until TIMESTAMPTZ NOT NULL,

  -- Usage limits
  usage_limit INTEGER, -- NULL = unlimited
  times_used INTEGER DEFAULT 0,

  -- Status
  active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Voucher usage tracking: who used what, when
CREATE TABLE IF NOT EXISTS voucher_usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  voucher_id UUID NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  booking_id TEXT, -- linked after booking confirmed

  -- Snapshot of discount applied
  original_price DECIMAL(10, 2) NOT NULL,
  discount_applied DECIMAL(10, 2) NOT NULL,
  final_price DECIMAL(10, 2) NOT NULL,
  currency TEXT DEFAULT 'PHP',

  used_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add voucher columns to bookings table
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS voucher_code TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10, 2) DEFAULT 0;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_vouchers_code ON vouchers(code);
CREATE INDEX IF NOT EXISTS idx_vouchers_active ON vouchers(active, valid_from, valid_until);
CREATE INDEX IF NOT EXISTS idx_voucher_usage_user ON voucher_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_voucher_usage_voucher ON voucher_usage(voucher_id);

-- RLS policies
ALTER TABLE vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE voucher_usage ENABLE ROW LEVEL SECURITY;

-- Vouchers: readable by authenticated users (codes are public), writable by service role only
CREATE POLICY "vouchers_read_authenticated" ON vouchers
  FOR SELECT TO authenticated USING (true);

-- Voucher usage: users can only see their own usage
CREATE POLICY "voucher_usage_read_own" ON voucher_usage
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "voucher_usage_insert_own" ON voucher_usage
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- Seed demo vouchers (for development/testing)
-- ============================================================================

INSERT INTO vouchers (code, description, discount_type, discount_value, min_booking_amount, max_discount_amount, category, valid_from, valid_until, usage_limit) VALUES
  ('WELCOME10', '10% off your first booking', 'percent', 10, 1000, 5000, 'first_time', NOW(), NOW() + INTERVAL '1 year', NULL),
  ('SAVE500', '₱500 off bookings over ₱5,000', 'fixed', 500, 5000, NULL, 'general', NOW(), NOW() + INTERVAL '6 months', 1000),
  ('SUMMER25', '25% off summer getaways', 'percent', 25, 3000, 10000, 'seasonal', NOW(), NOW() + INTERVAL '3 months', 500),
  ('MANILA15', '15% off Manila hotels', 'percent', 15, 2000, 8000, 'location_based', NOW(), NOW() + INTERVAL '6 months', NULL),
  ('FLAT1000', '₱1,000 off any booking over ₱8,000', 'fixed', 1000, 8000, NULL, 'general', NOW(), NOW() + INTERVAL '1 year', 200)
ON CONFLICT (code) DO NOTHING;
