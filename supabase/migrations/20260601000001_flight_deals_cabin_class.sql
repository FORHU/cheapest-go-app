-- Add cabin_class to flight_deals so the CRON can search each class separately.
-- Existing rows default to 'economy'.

ALTER TABLE flight_deals
    ADD COLUMN IF NOT EXISTS cabin_class TEXT NOT NULL DEFAULT 'economy'
        CHECK (cabin_class IN ('economy', 'premium_economy', 'business', 'first'));

-- ── Seed: one-way economy deals (return_date IS NULL) ────────────────────────
-- Prices below are bootstrap placeholders; the refresh-deal-prices CRON will
-- overwrite price/airline/discount_tag/ends_in with live API data on its next run.
INSERT INTO flight_deals
    (origin, destination, price, original_price, baseline_price, currency,
     cabin_class, departure_date, return_date, image_url, ends_in)
VALUES
    -- One-way economy
    ('MNL', 'BKK', 79.00,  110.00, 110.00, 'USD', 'economy',
     CURRENT_DATE + 14,  NULL, NULL, '14d'),
    ('MNL', 'KUL', 65.00,  95.00,  95.00,  'USD', 'economy',
     CURRENT_DATE + 21,  NULL, NULL, '21d'),
    ('CEB', 'SIN', 88.00,  120.00, 120.00, 'USD', 'economy',
     CURRENT_DATE + 10,  NULL, NULL, '10d'),
    ('MNL', 'TPE', 110.00, 155.00, 155.00, 'USD', 'economy',
     CURRENT_DATE + 28,  NULL, NULL, '28d'),
    ('MNL', 'CGK', 95.00,  135.00, 135.00, 'USD', 'economy',
     CURRENT_DATE + 18,  NULL, NULL, '18d'),

    -- One-way premium economy
    ('MNL', 'NRT', 420.00, 520.00, 520.00, 'USD', 'premium_economy',
     CURRENT_DATE + 35,  NULL, NULL, '35d'),
    ('MNL', 'SYD', 380.00, 480.00, 480.00, 'USD', 'premium_economy',
     CURRENT_DATE + 42,  NULL, NULL, '42d'),

    -- Round-trip business class
    ('MNL', 'HKG', 680.00,  850.00, 850.00, 'USD', 'business',
     CURRENT_DATE + 30, CURRENT_DATE + 37, NULL, '30d'),
    ('MNL', 'ICN', 1100.00, 1400.00, 1400.00, 'USD', 'business',
     CURRENT_DATE + 45, CURRENT_DATE + 52, NULL, '45d'),
    ('MNL', 'SIN', 520.00,  680.00, 680.00, 'USD', 'business',
     CURRENT_DATE + 20, CURRENT_DATE + 24, NULL, '20d'),

    -- One-way business
    ('MNL', 'DXB', 950.00, 1200.00, 1200.00, 'USD', 'business',
     CURRENT_DATE + 50, NULL, NULL, '50d'),

    -- Round-trip first class
    ('MNL', 'LHR', 4200.00, 5500.00, 5500.00, 'USD', 'first',
     CURRENT_DATE + 60, CURRENT_DATE + 74, NULL, '60d'),
    ('MNL', 'NRT', 3100.00, 4000.00, 4000.00, 'USD', 'first',
     CURRENT_DATE + 55, CURRENT_DATE + 62, NULL, '55d')
ON CONFLICT DO NOTHING;
