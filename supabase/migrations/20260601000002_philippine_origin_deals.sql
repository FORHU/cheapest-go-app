-- Seed international flight deals from Clark (CRK) and additional Cebu (CEB)
-- routes, covering the main Philippine carriers and hubs.
--
-- Prices below are bootstrap baselines; the refresh-deal-prices CRON replaces
-- price / airline / discount_tag / ends_in with live Mystifly or Duffel data
-- on its next run (every 6 hours).  cabin_class drives which fare bucket the
-- CRON searches for each row.

INSERT INTO flight_deals
    (origin, destination, price, original_price, baseline_price, currency,
     airline, cabin_class, departure_date, return_date, image_url, ends_in)
VALUES

    -- ── Clark International Airport (CRK) ─────────────────────────────────────
    -- Cebu Pacific operates the core Clark international routes
    ('CRK', 'ICN', 155.00, 210.00, 210.00, 'USD', '5J', 'economy',
     CURRENT_DATE + 21, NULL, NULL, '21d'),

    ('CRK', 'SIN', 110.00, 155.00, 155.00, 'USD', '5J', 'economy',
     CURRENT_DATE + 14, NULL, NULL, '14d'),

    ('CRK', 'HKG', 130.00, 175.00, 175.00, 'USD', '5J', 'economy',
     CURRENT_DATE + 18, NULL, NULL, '18d'),

    ('CRK', 'MFM', 125.00, 170.00, 170.00, 'USD', 'Z2', 'economy',
     CURRENT_DATE + 16, NULL, NULL, '16d'),

    ('CRK', 'KUL', 95.00,  140.00, 140.00, 'USD', 'Z2', 'economy',
     CURRENT_DATE + 12, NULL, NULL, '12d'),

    -- Clark round-trip (business)
    ('CRK', 'ICN', 680.00, 900.00, 900.00, 'USD', '5J', 'business',
     CURRENT_DATE + 35, CURRENT_DATE + 42, NULL, '35d'),

    -- ── Cebu (CEB) — additional destinations ──────────────────────────────────
    ('CEB', 'ICN', 185.00, 250.00, 250.00, 'USD', '5J', 'economy',
     CURRENT_DATE + 25, NULL, NULL, '25d'),

    ('CEB', 'NRT', 240.00, 320.00, 320.00, 'USD', '5J', 'economy',
     CURRENT_DATE + 30, NULL, NULL, '30d'),

    ('CEB', 'KIX', 210.00, 285.00, 285.00, 'USD', '5J', 'economy',
     CURRENT_DATE + 22, NULL, NULL, '22d'),

    ('CEB', 'HKG', 145.00, 200.00, 200.00, 'USD', 'CX', 'economy',
     CURRENT_DATE + 17, NULL, NULL, '17d'),

    ('CEB', 'KWI', 320.00, 440.00, 440.00, 'USD', 'KU', 'economy',
     CURRENT_DATE + 28, CURRENT_DATE + 56, NULL, '28d'),

    ('CEB', 'DXB', 290.00, 400.00, 400.00, 'USD', 'EK', 'economy',
     CURRENT_DATE + 40, CURRENT_DATE + 47, NULL, '40d'),

    -- Cebu premium economy
    ('CEB', 'NRT', 580.00, 750.00, 750.00, 'USD', '5J', 'premium_economy',
     CURRENT_DATE + 50, CURRENT_DATE + 57, NULL, '50d'),

    -- ── More Manila (MNL) routes via Philippine carriers ──────────────────────
    ('MNL', 'ICN', 175.00, 240.00, 240.00, 'USD', '5J', 'economy',
     CURRENT_DATE + 19, NULL, NULL, '19d'),

    ('MNL', 'NRT', 195.00, 265.00, 265.00, 'USD', '5J', 'economy',
     CURRENT_DATE + 26, NULL, NULL, '26d'),

    ('MNL', 'KUL', 75.00,  110.00, 110.00, 'USD', 'Z2', 'economy',
     CURRENT_DATE + 11, NULL, NULL, '11d'),

    ('MNL', 'DOH', 280.00, 380.00, 380.00, 'USD', 'QR', 'economy',
     CURRENT_DATE + 33, CURRENT_DATE + 40, NULL, '33d'),

    ('MNL', 'RUH', 260.00, 360.00, 360.00, 'USD', 'SV', 'economy',
     CURRENT_DATE + 36, CURRENT_DATE + 50, NULL, '36d'),

    ('MNL', 'KWI', 310.00, 420.00, 420.00, 'USD', 'KU', 'economy',
     CURRENT_DATE + 29, CURRENT_DATE + 43, NULL, '29d'),

    -- Manila business class (Middle East – popular OFW corridor)
    ('MNL', 'DXB', 1100.00, 1450.00, 1450.00, 'USD', 'EK', 'business',
     CURRENT_DATE + 38, CURRENT_DATE + 52, NULL, '38d'),

    ('MNL', 'DOH', 980.00, 1300.00, 1300.00, 'USD', 'QR', 'business',
     CURRENT_DATE + 44, CURRENT_DATE + 58, NULL, '44d')

ON CONFLICT DO NOTHING;
