-- Manual reconciliation of three diverged records on LIVE RDS.
-- No BEGIN/COMMIT in here — the command that runs it supplies those.
--
-- Before the real run, confirm two values against the RateHawk dashboard
-- (search client reference FORHU-1785814877094-7G2SM). They are marked CONFIRM
-- below. If they differ from what is written here, edit those two lines only.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Stale Booking — Aria Hotel Jeju (RateHawk order 989088624)
--    Cancelled in the RateHawk dashboard; Stripe refunded 2026-08-19 11:29 UTC.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE bookings
   SET status     = 'cancelled_refunded',
       updated_at = NOW()
 WHERE booking_id = 'FORHU-1786965181655-TOD6S'
   AND status     = 'confirmed';          -- guard: no-op if already corrected

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Stale Booking — Jeju Olympia Hotel (RateHawk order 215518622)
--    Cancelled in the RateHawk dashboard; Stripe refunded 2026-08-17 10:12 UTC.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE bookings
   SET status     = 'cancelled_refunded',
       updated_at = NOW()
 WHERE booking_id = 'FORHU-1786593033727-QNLCS'
   AND status     = 'confirmed';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Unrecorded Reservation — Miasageori Station Daewon, USD 44.18
--    Confirmed at the supplier 2026-08-04 03:41 UTC; both INSERT and emergency
--    INSERT failed, so no row was ever written. Already cancelled at RateHawk
--    and refunded in Stripe, so it is reconstructed directly in its end state.
--
--    provider_metadata is written as a real jsonb OBJECT here, not the
--    double-encoded string the app currently produces.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO bookings (
    booking_id, user_id,
    property_name, room_name,
    check_in, check_out,
    guests_adults, guests_children,
    total_price, currency, charged_price,
    holder_first_name, holder_last_name, holder_email,
    status, policy_type,
    provider, provider_metadata, hotel_id,
    payment_intent_id,
    created_at, updated_at
) VALUES (
    'FORHU-1785814877094-7G2SM',
    'adc8b5db-7293-4edf-8b6f-557ec457385c',      -- neyneyclyde@gmail.com
    'Miasageori Station Daewon',
    'Standard room',
    '2026-09-01'::date,                          -- CONFIRM against RateHawk
    '2026-09-03'::date,                          -- CONFIRM against RateHawk
    2, 0,
    44.18, 'USD', 44.18,
    'Jung', 'Kwan', 'clydeantonio.work@gmail.com',
    'cancelled_refunded',
    'free_cancellation',
    'travelgatex',
    jsonb_build_object(
        'supplierRef',      '967778226',         -- CONFIRM against RateHawk
        'hotelCode',        '11162318',
        'clientReference',  'FORHU-1785814877094-7G2SM',
        'reconstructed',    true,
        'reconstructedAt',  '2026-09-04',
        'reconstructedWhy', 'Unrecorded Reservation: confirm succeeded, both INSERTs failed 2026-08-04'
    ),
    '11162318',
    'pi_3U0ZDiC6cOjdwOIC13w89Ikx',
    '2026-08-04T03:41:00Z'::timestamptz,
    NOW()
)
ON CONFLICT (booking_id) DO NOTHING;         -- guard: no-op if already inserted

-- ─────────────────────────────────────────────────────────────────────────────
-- Verify. Expect exactly three rows, all reading cancelled_refunded.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT booking_id, property_name, status, total_price, currency,
       payment_intent_id,
       jsonb_typeof(provider_metadata)                      AS meta_type,
       COALESCE(provider_metadata ->> 'supplierRef',
                (provider_metadata #>> '{}')::jsonb ->> 'supplierRef') AS supplier_ref,
       created_at, updated_at
  FROM bookings
 WHERE booking_id IN ('FORHU-1786965181655-TOD6S',
                      'FORHU-1786593033727-QNLCS',
                      'FORHU-1785814877094-7G2SM')
 ORDER BY created_at;
