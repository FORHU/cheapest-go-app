-- Two backfills on live RDS. Both are derived from data already in the row —
-- nothing here needs an external lookup or a judgement call.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. FX columns missed on the reconstructed row FORHU-1785814877094-7G2SM.
--    Its INSERT was built from a stale schema.prisma, which does not carry
--    usd_amount / fx_rate / fx_captured_at / fx_source.
--
--    Values match the pattern every other USD booking uses: charge currency is
--    USD, so the conversion is the identity and usd_amount equals total_price.
--    fx_captured_at mirrors created_at, as on all nine sibling rows.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE bookings
   SET usd_amount     = total_price,
       fx_rate        = 1.0,
       fx_captured_at = created_at,
       fx_source      = 'identity',
       updated_at     = NOW()
 WHERE booking_id = 'FORHU-1785814877094-7G2SM'
   AND currency   = 'USD'
   AND usd_amount IS NULL;          -- guard: no-op once filled

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. booking_reference across all hotel bookings.
--    For hotels the reference and booking_id are the same string — see the
--    comment at src/lib/server/bookings.ts:396. The column was added by
--    20260902000001_add_booking_reference.sql, after every existing row was
--    written, so all ten are NULL purely because they predate it.
--
--    source_brand is deliberately NOT backfilled. GeomeeGo went live 2026-07-21,
--    before all of these bookings, so 'CheapestGo' would be an assumption rather
--    than a fact. The authority is Stripe PaymentIntent metadata (`brand`), which
--    needs a live-mode read.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE bookings
   SET booking_reference = booking_id
 WHERE booking_reference IS NULL;

-- Verify. Expect ten rows, every booking_reference filled, source_brand still NULL.
SELECT booking_id, booking_reference, source_brand,
       currency, total_price, usd_amount, fx_rate, fx_source
  FROM bookings
 ORDER BY created_at DESC;
