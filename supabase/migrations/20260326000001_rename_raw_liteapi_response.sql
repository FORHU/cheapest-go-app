-- ============================================================================
-- Migration: rename raw_liteapi_response → raw_provider_response
-- Removes LiteAPI-specific column name. ONDA is now the hotel provider.
-- ============================================================================

-- 1. Rename the column
ALTER TABLE booking_policy_snapshots
  RENAME COLUMN raw_liteapi_response TO raw_provider_response;

-- 2. Drop and recreate the save_booking_transaction RPC to use new column name
DROP FUNCTION IF EXISTS save_booking_transaction(JSONB, JSONB, JSONB);

CREATE OR REPLACE FUNCTION save_booking_transaction(
  p_booking  JSONB,
  p_snapshot JSONB,
  p_tiers    JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_booking_id   UUID;
  v_snapshot_id  UUID;
BEGIN
  -- 1. Insert booking
  INSERT INTO bookings (
    booking_id,
    user_id,
    hotel_id,
    property_name,
    property_image,
    room_name,
    check_in,
    check_out,
    guests_adults,
    guests_children,
    total_price,
    currency,
    holder_first_name,
    holder_last_name,
    holder_email,
    special_requests,
    voucher_code,
    discount_amount,
    status,
    cancellation_policy
  ) VALUES (
    COALESCE((p_booking->>'booking_id')::UUID, gen_random_uuid()),
    (p_booking->>'user_id')::UUID,
    p_booking->>'hotel_id',
    p_booking->>'property_name',
    p_booking->>'property_image',
    p_booking->>'room_name',
    (p_booking->>'check_in')::DATE,
    (p_booking->>'check_out')::DATE,
    COALESCE((p_booking->>'guests_adults')::INTEGER, 1),
    COALESCE((p_booking->>'guests_children')::INTEGER, 0),
    (p_booking->>'total_price')::DECIMAL,
    p_booking->>'currency',
    p_booking->>'holder_first_name',
    p_booking->>'holder_last_name',
    p_booking->>'holder_email',
    p_booking->>'special_requests',
    p_booking->>'voucher_code',
    COALESCE((p_booking->>'discount_amount')::DECIMAL, 0),
    COALESCE(p_booking->>'status', 'confirmed'),
    p_snapshot->'raw_provider_response'
  )
  RETURNING booking_id INTO v_booking_id;

  -- 2. Insert policy snapshot
  INSERT INTO booking_policy_snapshots (
    booking_id,
    policy_type,
    summary,
    refundable_tag,
    hotel_remarks,
    no_show_penalty,
    early_departure_fee,
    free_cancel_deadline,
    raw_provider_response,
    captured_at
  ) VALUES (
    v_booking_id,
    (p_snapshot->>'policy_type')::booking_policy_type,
    p_snapshot->>'summary',
    p_snapshot->>'refundable_tag',
    COALESCE(
      ARRAY(SELECT jsonb_array_elements_text(p_snapshot->'hotel_remarks')),
      '{}'::TEXT[]
    ),
    COALESCE((p_snapshot->>'no_show_penalty')::DECIMAL, 0),
    COALESCE((p_snapshot->>'early_departure_fee')::DECIMAL, 0),
    CASE
      WHEN p_snapshot->>'free_cancel_deadline' IS NOT NULL
      THEN (p_snapshot->>'free_cancel_deadline')::TIMESTAMPTZ
      ELSE NULL
    END,
    COALESCE(p_snapshot->'raw_provider_response', '{}'::JSONB),
    NOW()
  )
  RETURNING id INTO v_snapshot_id;

  -- 3. Update bookings with snapshot reference
  UPDATE bookings
    SET policy_snapshot_id = v_snapshot_id
    WHERE booking_id = v_booking_id;

  -- 4. Insert policy tiers (if any)
  IF jsonb_array_length(p_tiers) > 0 THEN
    INSERT INTO booking_policy_tiers (
      snapshot_id,
      cancel_deadline,
      penalty_amount,
      penalty_type,
      currency,
      tier_order
    )
    SELECT
      v_snapshot_id,
      (tier->>'cancel_deadline')::TIMESTAMPTZ,
      (tier->>'penalty_amount')::DECIMAL,
      tier->>'penalty_type',
      tier->>'currency',
      (tier->>'tier_order')::INTEGER
    FROM jsonb_array_elements(p_tiers) AS tier;
  END IF;

  RETURN jsonb_build_object(
    'booking_id', v_booking_id,
    'snapshot_id', v_snapshot_id
  );

EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$;
