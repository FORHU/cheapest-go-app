-- Test hotel booking seed using real TravelgateX API test data
-- Hotel: The Fusion Resort, Phuket, TH (hotel_id: 8301216)
-- Run with: psql $DATABASE_URL -f db/seeds/001_test_hotel_booking.sql

INSERT INTO public.bookings (
    id,
    booking_id,
    user_id,
    property_name,
    property_image,
    property_lat,
    property_lng,
    hotel_id,
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
    provider,
    provider_metadata,
    supplier_cost,
    charged_price,
    markup_pct,
    policy_type,
    cancellation_policy,
    payment_intent_id,
    created_at,
    updated_at
)
VALUES (
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    'FORHU-1782500000000-F9R2K',
    '07c5f528-7363-4e29-8226-e8cefaa74ce2',
    'The Fusion Resort',
    'https://cdn.worldota.net/t/1024x768/content/a8/ef/a8ef06e147fc134f9edc09705cc1197d2e96384d.jpeg',
    7.8550596,
    98.34343,
    '8301216',
    'Superior Room with Pool View',
    '2026-07-18',
    '2026-07-21',
    2,
    0,
    8750.00,
    'PHP',
    'Clyde',
    'Antonio',
    'clydeantonio.work@gmail.com',
    'confirmed',
    'travelgatex',
    '{
        "hotelCode": "8301216",
        "supplierRef": "174000001",
        "tgxBookingId": "TGX-TEST-20260626",
        "clientReference": "FORHU-1782500000000-F9R2K"
    }'::jsonb,
    7500.00,
    8750.00,
    16.67,
    'free_cancellation',
    '{
        "refundableTag": "RFN",
        "cancelPolicyInfos": [
            {
                "type": "AMOUNT",
                "amount": 0,
                "currency": "PHP",
                "cancelTime": "2026-07-15T00:00:00Z"
            },
            {
                "type": "PERCENT",
                "amount": 100,
                "currency": "PHP",
                "cancelTime": "2026-07-18T00:00:00Z"
            }
        ]
    }'::jsonb,
    'pi_test_fusion_resort_20260626',
    NOW(),
    NOW()
)
ON CONFLICT (id) DO NOTHING;
