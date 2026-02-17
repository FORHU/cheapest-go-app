-- ============================================================================
-- Postgres RPC for atomic booking + policy snapshot creation
-- Runs as a single transaction: all succeed or all fail.
-- ============================================================================

CREATE OR REPLACE FUNCTION create_booking_with_policy(
  p_booking JSONB,
  p_snapshot JSONB,
  p_tiers JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_booking_id TEXT;
  v_snapshot_id UUID;
  v_tier JSONB;
  v_tier_order INT := 0;
BEGIN
  -- 1. Insert booking
  v_booking_id := p_booking->>'booking_id';

  INSERT INTO bookings (
    booking_id,
    user_id,
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
    status,
    special_requests,
    voucher_code,
    discount_amount,
    policy_type,
    cancellation_policy
  ) VALUES (
    v_booking_id,
    (p_booking->>'user_id')::UUID,
    p_booking->>'property_name',
    p_booking->>'property_image',
    p_booking->>'room_name',
    (p_booking->>'check_in')::DATE,
    (p_booking->>'check_out')::DATE,
    COALESCE((p_booking->>'guests_adults')::INTEGER, 1),
    COALESCE((p_booking->>'guests_children')::INTEGER, 0),
    (p_booking->>'total_price')::DECIMAL,
    COALESCE(p_booking->>'currency', 'PHP'),
    p_booking->>'holder_first_name',
    p_booking->>'holder_last_name',
    p_booking->>'holder_email',
    COALESCE(p_booking->>'status', 'confirmed'),
    p_booking->>'special_requests',
    p_booking->>'voucher_code',
    COALESCE((p_booking->>'discount_amount')::DECIMAL, 0),
    COALESCE(p_booking->>'policy_type', 'non_refundable'),
    p_snapshot->'raw_liteapi_response'
  );

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
    raw_liteapi_response,
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
    COALESCE(p_snapshot->'raw_liteapi_response', '{}'::JSONB),
    NOW()
  )
  RETURNING id INTO v_snapshot_id;

  -- 3. Update bookings with snapshot reference
  UPDATE bookings
    SET policy_snapshot_id = v_snapshot_id
    WHERE booking_id = v_booking_id;

  -- 4. Insert policy tiers
  FOR v_tier IN SELECT * FROM jsonb_array_elements(p_tiers)
  LOOP
    INSERT INTO policy_tiers (
      snapshot_id,
      cancel_deadline,
      penalty_amount,
      penalty_type,
      currency,
      tier_order
    ) VALUES (
      v_snapshot_id,
      (v_tier->>'cancel_deadline')::TIMESTAMPTZ,
      (v_tier->>'penalty_amount')::DECIMAL,
      COALESCE(v_tier->>'penalty_type', 'fixed'),
      COALESCE(v_tier->>'currency', 'PHP'),
      v_tier_order
    );
    v_tier_order := v_tier_order + 1;
  END LOOP;

  -- 5. Return result
  RETURN jsonb_build_object(
    'booking_id', v_booking_id,
    'snapshot_id', v_snapshot_id,
    'tier_count', v_tier_order
  );
END;
$$;
